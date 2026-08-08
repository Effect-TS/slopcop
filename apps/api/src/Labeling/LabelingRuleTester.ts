import * as DomainGitHubPullRequest from "@slopcop/domain/GitHub/GitHubPullRequest"
import type * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import type * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as LabelClassification from "@slopcop/domain/Labeling/LabelClassification"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { GitHubAppAuth } from "@slopcop/github/GitHubAppAuth"
import type { RepositoryNotConfigured } from "@slopcop/github/Errors"
import {
  GitHubClient,
  GitHubClientError,
  type PullRequestSummary,
} from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import {
  isGeneratedChangesetsReleasePullRequest,
  LabelClassifier,
} from "@slopcop/labeling/LabelClassifier"
import { planLabels } from "@slopcop/labeling/LabelPolicy"
import {
  hasChangesRequested,
  isChangesetCandidate,
  isValidChangesetContent,
  planReadyForReviewLabels,
  readyForReviewRationale,
  readyForReviewDisposition,
  requiredChecksPass,
} from "@slopcop/labeling/ReadyForReviewPolicy"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import type { LabelingRuleNotFound } from "@slopcop/labeling/LabelingRuleErrors"

export class LabelingRuleTestError extends Data.TaggedError(
  "LabelingRuleTestError",
)<{
  readonly repository: string
  readonly ruleId: string
  readonly pullRequestNumber: number
  readonly retryable: boolean
  readonly notFound: boolean
  readonly message: string
  readonly cause: unknown
}> {}

const decodeClassificationInput = Schema.decodeUnknownEffect(
  LabelClassification.ClassificationInput,
)

const boundedSubject = (
  summary: PullRequestSummary,
  files: ReadonlyArray<DomainGitHubPullRequest.GitHubPullRequestFile>,
) => {
  let remaining = DomainGitHubPullRequest.MAX_TOTAL_PATCH_CHARS
  return {
    type: "pull_request" as const,
    number: summary.number,
    title: summary.title,
    body: summary.body,
    baseRef: summary.base.ref,
    headSha: summary.head.sha,
    files: files.slice(0, DomainGitHubPullRequest.MAX_FILES).map((file) => {
      const available = Math.min(
        DomainGitHubPullRequest.MAX_PATCH_CHARS_PER_FILE,
        remaining,
      )
      const patch = file.patch?.slice(0, available) ?? null
      remaining -= patch?.length ?? 0
      return {
        filename: file.filename,
        status: file.status,
        patch,
        patchTruncated:
          file.patch !== undefined && patch?.length !== file.patch.length,
      }
    }),
  }
}

export class LabelingRuleTester extends Context.Service<
  LabelingRuleTester,
  {
    readonly test: (
      repository: { readonly owner: string; readonly repo: string },
      ruleId: LabelingRule.LabelingRule["id"],
      pullRequestNumber: number,
    ) => Effect.Effect<
      LabelingRuleManagement.TestLabelingRuleResponse,
      RepositoryNotConfigured | LabelingRuleNotFound | LabelingRuleTestError
    >
  }
>()("@slopcop/api/Labeling/LabelingRuleTester", {
  make: Effect.gen(function* () {
    const rules = yield* LabelingRules
    const repositories = yield* GitHubRepositoriesRepo
    const github = yield* GitHubClient
    const classify = yield* LabelClassifier
    const { appId: ownAppId } = yield* GitHubAppAuth

    const run = Effect.fn("LabelingRuleTester.test")(function* (
      slug: { readonly owner: string; readonly repo: string },
      ruleId: LabelingRule.LabelingRule["id"],
      pullRequestNumber: number,
    ) {
      const rule = yield* rules.get(slug, ruleId)
      const maybeRepository = yield* repositories.findBySlug(slug)
      if (Option.isNone(maybeRepository)) {
        return yield* Effect.die(
          `Configured repository ${slug.owner}/${slug.repo} disappeared during rule test.`,
        )
      }
      const repository = maybeRepository.value
      const summary = yield* github.getPullRequest(
        repository,
        pullRequestNumber,
      )
      const files = yield* github
        .listPullRequestFiles(repository, pullRequestNumber)
        .pipe(Stream.runCollect)
      const currentLabels = new Set(
        (yield* github
          .listItemLabels(repository, pullRequestNumber)
          .pipe(Stream.runCollect)).map((label) => label.name),
      )

      if (rule.kind === "ai") {
        const input = yield* decodeClassificationInput({
          subject: boundedSubject(summary, files),
          ruleSet: {
            revision: repository.rulesRevision,
            rules: [
              {
                id: rule.id,
                label: rule.label,
                instructions: rule.instructions,
                exclusiveGroup: rule.exclusiveGroup,
              },
            ],
          },
        })
        const result = yield* classify(input)
        const decision = result.decisions[0]
        if (decision === undefined)
          return yield* Effect.die(
            "Single-rule classification returned no decision.",
          )
        const plan = planLabels({
          rules: [rule],
          decisions: [decision],
          currentLabels,
        })
        return {
          ruleId: rule.id,
          pullRequestNumber,
          applies: decision.applies,
          selected: plan.selectedRuleIds.includes(rule.id),
          confidence: decision.confidence,
          confidenceThreshold: rule.confidenceThreshold,
          rationale: decision.rationale,
          proposedLabelChanges: plan.changes,
        }
      }

      const subject = boundedSubject(summary, files)
      const generatedRelease = isGeneratedChangesetsReleasePullRequest(subject)
      const candidates = files.filter(
        (file) =>
          file.status === "added" && isChangesetCandidate(file.filename),
      )
      const [validChangeset, checksPass, reviewsClear] =
        summary.draft || generatedRelease
          ? ([false, false, false] as const)
          : yield* Effect.all(
              [
                Effect.forEach(candidates, (file) =>
                  github.getFileContent(
                    repository,
                    file.filename,
                    summary.head.sha,
                  ),
                ).pipe(
                  Effect.map((contents) =>
                    contents.some(isValidChangesetContent),
                  ),
                ),
                Effect.all(
                  [
                    github.listRequiredChecks(repository, summary.base.ref),
                    github.listCheckRuns(repository, summary.head.sha),
                    github.listCommitStatuses(repository, summary.head.sha),
                  ],
                  { concurrency: 3 },
                ).pipe(
                  Effect.map(([requiredChecks, checkRuns, statuses]) =>
                    requiredChecksPass({
                      requiredChecks,
                      checkRuns,
                      statuses,
                      ownAppId,
                    }),
                  ),
                ),
                github
                  .listPullRequestReviews(repository, pullRequestNumber)
                  .pipe(Effect.map((reviews) => !hasChangesRequested(reviews))),
              ],
              { concurrency: 3 },
            )
      const applies =
        !summary.draft &&
        !generatedRelease &&
        validChangeset &&
        checksPass &&
        reviewsClear
      const plan = planReadyForReviewLabels({
        disposition: readyForReviewDisposition({ generatedRelease, applies }),
        labels: [rule.label],
        currentLabels,
      })
      return {
        ruleId: rule.id,
        pullRequestNumber,
        applies,
        selected: plan.selected,
        confidence: 1,
        confidenceThreshold: rule.confidenceThreshold,
        rationale: readyForReviewRationale({
          draft: summary.draft,
          generatedRelease,
          validChangeset,
          checksPass,
          reviewsClear,
        }),
        proposedLabelChanges: plan.changes,
      }
    })

    return {
      test: (repository, ruleId, pullRequestNumber) =>
        run(repository, ruleId, pullRequestNumber).pipe(
          Effect.mapError((cause) => {
            if (
              cause._tag === "RepositoryNotConfigured" ||
              cause._tag === "LabelingRuleNotFound"
            )
              return cause
            const githubError =
              cause instanceof GitHubClientError ? cause : null
            return new LabelingRuleTestError({
              repository: `${repository.owner}/${repository.repo}`,
              ruleId,
              pullRequestNumber,
              retryable: githubError?.retryable ?? false,
              notFound:
                githubError?.operation === "GitHubClient.getPullRequest" &&
                githubError.status === 404,
              message:
                githubError?.operation === "GitHubClient.getPullRequest" &&
                githubError.status === 404
                  ? `Pull request #${pullRequestNumber} does not exist or is not accessible.`
                  : "The labeling rule test could not be completed. No labels or production decisions were written.",
              cause,
            })
          }),
        ),
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([
      LabelingRules.layer,
      GitHubRepositoriesRepo.layer,
      GitHubClient.layer,
      GitHubAppAuth.layer,
      LabelClassifier.layerNoDeps,
    ]),
  )
}
