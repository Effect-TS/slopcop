import * as GitHubEvent from "@slopcop/domain/GitHub/GitHubEvent"
import * as PullRequestWebhookEvent from "@slopcop/domain/GitHub/WebhookEvent/GitHubPullRequest"
import * as LabelClassification from "@slopcop/domain/Labeling/LabelClassification"
import * as LabelingDecision from "@slopcop/domain/Labeling/LabelingDecision"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { GitHubPullRequest } from "../GitHub/GitHubPullRequest.ts"
import {
  LABEL_CLASSIFIER_PROMPT_VERSION,
  makeLabelClassifier,
} from "./LabelClassifier.ts"
import { LabelingDecisionsRepo } from "./repositories/LabelingDecisionsRepo.ts"
import { planLabels } from "./LabelPolicy.ts"
import { OpenAiLanguageModel } from "@effect/ai-openai"
import { OpenAiLayer } from "../Ai.ts"

export class PullRequestLabelingError extends Data.TaggedError(
  "PullRequestLabelingError",
)<{
  readonly deliveryId: string
  readonly message: string
  readonly cause: unknown
}> {}

const decodeClassificationInput = Schema.decodeUnknownEffect(
  LabelClassification.ClassificationInput,
)
const decodeDeliveryId = Schema.decodeUnknownEffect(GitHubEvent.GitHubEventId)

export interface PullRequestLabelingShape {
  readonly process: (
    event: PullRequestWebhookEvent.PullRequestWebhookEvent,
  ) => Effect.Effect<void, PullRequestLabelingError>
}

export class PullRequestLabeling extends Context.Service<
  PullRequestLabeling,
  PullRequestLabelingShape
>()("@slopcop/github-events/Labeling/PullRequestLabeling", {
  make: Effect.gen(function* () {
    const labelingModel = yield* Config.string("LABELING_AI_MODEL").pipe(
      Config.withDefault("gpt-5.6-luna"),
    )

    const pullRequests = yield* GitHubPullRequest
    const rules = yield* LabelingRules
    const classify = yield* makeLabelClassifier.pipe(
      Effect.provide(
        OpenAiLanguageModel.model(labelingModel, {
          reasoning: { effort: "low" },
        }),
      ),
    )
    const decisions = yield* LabelingDecisionsRepo
    const confidenceThreshold = yield* Config.schema(
      Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
      "LABEL_CONFIDENCE_THRESHOLD",
    ).pipe(Config.withDefault(0.75))

    const processEvent = Effect.fn("PullRequestLabeling.processEvent")(
      function* (event: PullRequestWebhookEvent.PullRequestWebhookEvent) {
        const pullRequest = yield* pullRequests.resolveWebhook(event)
        const repository = pullRequest.repository
        const snapshot = yield* rules.getActiveSnapshot(repository.id)
        if (snapshot.rules.length === 0) return

        const boundedEvidence = yield* pullRequests.getEvidence(pullRequest)
        const input = yield* decodeClassificationInput({
          subject: {
            type: "pull_request",
            number: boundedEvidence.number,
            title: boundedEvidence.title,
            body: boundedEvidence.body,
            baseRef: boundedEvidence.baseRef,
            headSha: boundedEvidence.headSha,
            files: boundedEvidence.files.map((file) => ({
              filename: file.filename,
              status: file.status,
              patch: file.patch,
              patchTruncated: file.patchOmission !== null,
            })),
          },
          ruleSet: {
            revision: snapshot.revision,
            rules: snapshot.rules.map((rule) => ({
              id: rule.id,
              label: rule.label,
              instructions: rule.instructions,
              exclusiveGroup: rule.exclusiveGroup,
            })),
          },
        })
        const classification = yield* classify(input)
        const currentLabels = yield* pullRequests.getLabels(pullRequest)
        const plan = planLabels({
          rules: snapshot.rules,
          decisions: classification.decisions,
          currentLabels,
          confidenceThreshold,
        })
        yield* rules.assertRevision(repository.id, snapshot.revision)

        const applied = yield* pullRequests.applyLabels(
          pullRequest,
          plan.changes,
        )
        const deliveryId = yield* decodeDeliveryId(pullRequest.deliveryId)
        yield* Effect.annotateLogs(
          Effect.logInfo(
            `Applied labels for ${repository.slug}#${pullRequest.number}: selected [${plan.selectedLabels.join(", ")}], added [${applied.added.join(", ")}], removed [${applied.removed.join(", ")}]`,
          ),
          {
            pullRequestUrl: `https://github.com/${repository.slug}/pull/${pullRequest.number}`,
          },
        )
        yield* decisions.record(
          LabelingDecision.LabelingDecision.insert.make({
            deliveryId,
            repositoryId: repository.id,
            subjectType: "pull_request",
            subjectNumber: pullRequest.number,
            headSha: pullRequest.headSha,
            rulesRevision: snapshot.revision,
            selectedRuleIds: plan.selectedRuleIds,
            selectedLabels: plan.selectedLabels,
            model: labelingModel,
            promptVersion: LABEL_CLASSIFIER_PROMPT_VERSION,
            labelsAdded: applied.added,
            labelsRemoved: applied.removed,
          }),
        )
      },
    )

    const process = (event: PullRequestWebhookEvent.PullRequestWebhookEvent) =>
      processEvent(event).pipe(
        Effect.mapError(
          (cause) =>
            new PullRequestLabelingError({
              deliveryId: event.id,
              message: `Pull request labeling failed for delivery ${event.id}. The queue may retry it.`,
              cause,
            }),
        ),
      )

    return { process }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([
      GitHubPullRequest.layer,
      LabelingRules.layer,
      LabelingDecisionsRepo.layer,
      OpenAiLayer,
    ]),
  )
}
