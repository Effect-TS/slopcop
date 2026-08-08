import * as GitHubEvent from "@slopcop/domain/GitHub/GitHubEvent"
import type * as DomainGitHubPullRequest from "@slopcop/domain/GitHub/GitHubPullRequest"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as LabelingDecision from "@slopcop/domain/Labeling/LabelingDecision"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { GitHubAppAuth } from "@slopcop/github/GitHubAppAuth"
import {
  GitHubClient,
  type PullRequestSummary,
} from "@slopcop/github/GitHubClient"
import { GitHubPullRequest } from "../GitHub/GitHubPullRequest.ts"
import { isGeneratedChangesetsReleasePullRequest } from "@slopcop/labeling/LabelClassifier"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import {
  hasChangesRequested,
  isChangesetCandidate,
  isValidChangesetContent,
  requiredChecksPass,
} from "@slopcop/labeling/ReadyForReviewPolicy"
import { LabelingDecisionsRepo } from "./repositories/LabelingDecisionsRepo.ts"

export class ReadyForReviewError extends Data.TaggedError(
  "ReadyForReviewError",
)<{
  readonly deliveryId: string
  readonly message: string
  readonly cause: unknown
}> {}

const decodeDeliveryId = Schema.decodeUnknownEffect(GitHubEvent.GitHubEventId)

const eventSource = (event: GitHubWebhookEvent.GitHubWebhookEvent) => {
  switch (event.name) {
    case "pull_request":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.pull_request.head.sha,
        number: event.payload.number,
      }
    case "pull_request_review":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.pull_request.head.sha,
        number: event.payload.pull_request.number,
      }
    case "check_suite":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.check_suite.head_sha,
        number: null,
      }
    case "check_run":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.check_run.head_sha,
        number: null,
      }
    case "status":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.sha,
        number: null,
      }
    case "ping":
    case "installation":
    case "installation_repositories":
      return null
  }
}

export class ReadyForReview extends Context.Service<
  ReadyForReview,
  {
    readonly process: (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) => Effect.Effect<void, ReadyForReviewError>
  }
>()("@slopcop/github-events/Labeling/ReadyForReview", {
  make: Effect.gen(function* () {
    const github = yield* GitHubClient
    const pullRequests = yield* GitHubPullRequest
    const rules = yield* LabelingRules
    const decisions = yield* LabelingDecisionsRepo
    const { appId: ownAppId } = yield* GitHubAppAuth

    const hasValidChangeset = Effect.fn("ReadyForReview.hasValidChangeset")(
      function* (
        pullRequest: DomainGitHubPullRequest.GitHubPullRequest,
        files: ReadonlyArray<DomainGitHubPullRequest.GitHubPullRequestFile>,
      ) {
        const candidates = files.filter(
          (file) =>
            file.status === "added" && isChangesetCandidate(file.filename),
        )
        return yield* Stream.fromIterable(candidates).pipe(
          Stream.rechunk(1),
          Stream.filterEffect((file) =>
            github
              .getFileContent(
                pullRequest.repository,
                file.filename,
                pullRequest.headSha,
              )
              .pipe(Effect.map(isValidChangesetContent)),
          ),
          Stream.runHead,
          Effect.map(Option.isSome),
        )
      },
    )

    const checksPass = Effect.fn("ReadyForReview.checksPass")(function* (
      pullRequest: DomainGitHubPullRequest.GitHubPullRequest,
    ) {
      const [requiredChecks, checkRuns, statuses] = yield* Effect.all(
        [
          github.listRequiredChecks(
            pullRequest.repository,
            pullRequest.baseRef,
          ),
          github.listCheckRuns(pullRequest.repository, pullRequest.headSha),
          github.listCommitStatuses(
            pullRequest.repository,
            pullRequest.headSha,
          ),
        ],
        { concurrency: 3 },
      )
      return requiredChecksPass({
        requiredChecks,
        checkRuns,
        statuses,
        ownAppId,
      })
    })

    const processPullRequest = Effect.fn("ReadyForReview.processPullRequest")(
      function* (
        deliveryId: string,
        repository: DomainGitHubPullRequest.GitHubPullRequest["repository"],
        summary: PullRequestSummary,
      ) {
        const snapshot = yield* rules.getActiveSnapshot(repository.id)
        const deterministicRules = snapshot.rules.filter(
          (rule) => rule.kind === "ready-for-review",
        )
        if (deterministicRules.length === 0) return

        const pullRequest: DomainGitHubPullRequest.GitHubPullRequest = {
          deliveryId,
          repository,
          number: summary.number,
          title: summary.title,
          body: summary.body,
          baseRef: summary.base.ref,
          headSha: summary.head.sha,
        }
        const files = summary.draft
          ? null
          : yield* github
              .listPullRequestFiles(repository, summary.number)
              .pipe(Stream.runCollect)
        const generatedRelease =
          files !== null &&
          isGeneratedChangesetsReleasePullRequest({
            type: "pull_request",
            number: summary.number,
            title: summary.title,
            body: summary.body,
            baseRef: summary.base.ref,
            headSha: summary.head.sha,
            files: files.map((file) => ({
              filename: file.filename,
              status: file.status,
              patch: file.patch ?? null,
              patchTruncated: false,
            })),
          })
        if (generatedRelease) return
        const applies =
          !summary.draft &&
          files !== null &&
          (yield* Effect.all(
            [
              hasValidChangeset(pullRequest, files),
              checksPass(pullRequest),
              github
                .listPullRequestReviews(repository, summary.number)
                .pipe(Effect.map((reviews) => !hasChangesRequested(reviews))),
            ],
            { concurrency: 3 },
          ).pipe(
            Effect.map(
              ([validChangeset, green, reviewsClear]) =>
                validChangeset && green && reviewsClear,
            ),
          ))

        const currentLabels = yield* pullRequests.getLabels(pullRequest)
        const selectedRules = applies ? deterministicRules : []
        const changes = {
          add: selectedRules
            .filter((rule) => !currentLabels.has(rule.label))
            .map((rule) => rule.label),
          remove: deterministicRules
            .filter(
              (rule) =>
                !applies &&
                rule.mode === "reconcile" &&
                currentLabels.has(rule.label),
            )
            .map((rule) => rule.label),
        }
        yield* rules.assertRevision(repository.id, snapshot.revision)
        const applied = yield* pullRequests.applyLabels(pullRequest, changes)
        const eventId = yield* decodeDeliveryId(deliveryId)
        yield* decisions.record(
          LabelingDecision.LabelingDecision.insert.make({
            deliveryId: eventId,
            repositoryId: repository.id,
            subjectType: "pull_request",
            subjectNumber: summary.number,
            headSha: summary.head.sha,
            rulesRevision: snapshot.revision,
            selectedRuleIds: selectedRules.map((rule) => rule.id),
            selectedLabels: selectedRules.map((rule) => rule.label),
            model: "deterministic",
            promptVersion: "ready-for-review-v2",
            labelsAdded: applied.added,
            labelsRemoved: applied.removed,
          }),
        )
      },
    )

    const processEvent = Effect.fn("ReadyForReview.processEvent")(function* (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) {
      const source = eventSource(event)
      if (source === null) return
      const repository = yield* pullRequests
        .resolveRepository(source.repository, source.installation)
        .pipe(
          Effect.catchTag("RepositoryNotConfigured", (error) =>
            Effect.annotateLogs(
              Effect.logInfo(
                "Skipped ready-for-review event for unconfigured repository",
              ),
              { deliveryId: event.id, repository: error.repository },
            ).pipe(Effect.as(null)),
          ),
        )
      if (repository === null) return
      const candidates = yield* github.listPullRequestsForCommit(
        repository,
        source.sha,
      )
      const current = candidates.filter(
        (candidate) =>
          candidate.head.sha === source.sha &&
          (source.number === null || candidate.number === source.number),
      )
      yield* Effect.forEach(
        current,
        (pullRequest) => processPullRequest(event.id, repository, pullRequest),
        { concurrency: 2, discard: true },
      )
    })

    return {
      process: (event) =>
        processEvent(event).pipe(
          Effect.mapError(
            (cause) =>
              new ReadyForReviewError({
                deliveryId: event.id,
                message: `Ready-for-review reconciliation failed for delivery ${event.id}.`,
                cause,
              }),
          ),
        ),
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([
      GitHubAppAuth.layer,
      GitHubClient.layer,
      GitHubPullRequest.layer,
      LabelingRules.layer,
      LabelingDecisionsRepo.layer,
    ]),
  )
}
