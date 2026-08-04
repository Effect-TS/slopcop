import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as DomainGitHubPullRequest from "@slopcop/domain/GitHub/GitHubPullRequest"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as PullRequestWebhookEvent from "@slopcop/domain/GitHub/WebhookEvent/GitHubPullRequest"
import * as LabelClassification from "@slopcop/domain/Labeling/LabelClassification"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { GitHubClient, GitHubClientError } from "@slopcop/github/GitHubClient"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import {
  GitHubRepositoriesRepo,
  type GitHubRepositoriesRepoError,
} from "@slopcop/github/repositories/GitHubRepositoriesRepo"

export class RepositoryInstallationMismatch extends Data.TaggedError(
  "RepositoryInstallationMismatch",
)<{
  readonly repository: string
  readonly expectedInstallationId: string
  readonly actualInstallationId: string
}> {}

export class RepositorySlugMismatch extends Data.TaggedError(
  "RepositorySlugMismatch",
)<{
  readonly githubId: string
  readonly expected: GitHubRepository.GitHubRepositorySlug
  readonly actual: GitHubRepository.GitHubRepositorySlug
}> {}

export class PullRequestEvidenceError extends Schema.TaggedErrorClass<PullRequestEvidenceError>()(
  "PullRequestEvidenceError",
  {
    repository: Schema.String,
    number: Schema.Int,
    status: Schema.optionalKey(Schema.Int),
    retryable: Schema.Boolean,
    message: Schema.String,
  },
) {}

export class GitHubPullRequestLabelsError extends Schema.TaggedErrorClass<GitHubPullRequestLabelsError>()(
  "GitHubPullRequestLabelsError",
  {
    operation: Schema.Literals(["get-current", "add", "remove"]),
    repository: Schema.String,
    number: Schema.Int,
    label: Schema.optionalKey(Schema.String),
    status: Schema.optionalKey(Schema.Int),
    retryable: Schema.Boolean,
    message: Schema.String,
  },
) {}

export type ResolveGitHubPullRequestError =
  | RepositoryNotConfigured
  | RepositoryInstallationMismatch
  | RepositorySlugMismatch
  | GitHubRepositoriesRepoError

const boundFile = (
  file: DomainGitHubPullRequest.GitHubPullRequestFile,
  remainingPatchChars: number,
): readonly [DomainGitHubPullRequest.ChangedFileEvidence, number] => {
  if (file.patch === undefined) {
    return [
      {
        filename: file.filename,
        status: file.status,
        patch: null,
        patchOmission: "unavailable",
      },
      remainingPatchChars,
    ]
  }

  if (remainingPatchChars === 0) {
    return [
      {
        filename: file.filename,
        status: file.status,
        patch: null,
        patchOmission: "total-limit",
      },
      remainingPatchChars,
    ]
  }

  const available = Math.min(
    DomainGitHubPullRequest.MAX_PATCH_CHARS_PER_FILE,
    remainingPatchChars,
  )
  const patch = file.patch.slice(0, available)
  const hitPerFileLimit =
    file.patch.length > DomainGitHubPullRequest.MAX_PATCH_CHARS_PER_FILE
  const hitTotalLimit = file.patch.length > remainingPatchChars
  return [
    {
      filename: file.filename,
      status: file.status,
      patch,
      patchOmission: hitTotalLimit
        ? "total-limit"
        : hitPerFileLimit
          ? "per-file-limit"
          : null,
    },
    remainingPatchChars - patch.length,
  ]
}

export class GitHubPullRequest extends Context.Service<
  GitHubPullRequest,
  {
    readonly resolveRepository: (
      target: PullRequestWebhookEvent.Repository,
      installation: PullRequestWebhookEvent.BasePullRequestPayload["installation"],
    ) => Effect.Effect<
      GitHubRepository.GitHubRepository,
      ResolveGitHubPullRequestError
    >
    readonly resolveWebhook: (
      event: PullRequestWebhookEvent.PullRequestWebhookEvent,
    ) => Effect.Effect<
      DomainGitHubPullRequest.GitHubPullRequest,
      ResolveGitHubPullRequestError
    >
    readonly getEvidence: (
      pullRequest: DomainGitHubPullRequest.GitHubPullRequest,
    ) => Effect.Effect<
      DomainGitHubPullRequest.PullRequestEvidence,
      PullRequestEvidenceError
    >
    readonly getLabels: (
      pullRequest: DomainGitHubPullRequest.GitHubPullRequest,
    ) => Effect.Effect<
      ReadonlySet<GitHubLabel.GitHubLabelName>,
      GitHubPullRequestLabelsError
    >
    readonly applyLabels: (
      pullRequest: DomainGitHubPullRequest.GitHubPullRequest,
      changes: LabelClassification.LabelChanges,
    ) => Effect.Effect<
      LabelClassification.AppliedLabelChanges,
      GitHubPullRequestLabelsError
    >
  }
>()("@slopcop/github-events/GitHubPullRequest", {
  make: Effect.gen(function* () {
    const repositories = yield* GitHubRepositoriesRepo
    const client = yield* GitHubClient

    const resolveRepository = Effect.fn("GitHubPullRequest.resolveRepository")(
      function* (
        target: PullRequestWebhookEvent.Repository,
        installation: PullRequestWebhookEvent.BasePullRequestPayload["installation"],
      ) {
        const result = yield* repositories.findByGitHubId(target.id)
        if (Option.isNone(result) || !result.value.enabled) {
          return yield* new RepositoryNotConfigured({
            repository: `${target.slug.owner}/${target.slug.repo}`,
          })
        }

        const repository = result.value
        if (repository.installationId !== installation.id) {
          return yield* new RepositoryInstallationMismatch({
            repository: repository.slug,
            expectedInstallationId: repository.installationId,
            actualInstallationId: installation.id,
          })
        }

        const actual = { owner: repository.owner, repo: repository.repo }
        if (
          actual.owner !== target.slug.owner ||
          actual.repo !== target.slug.repo
        ) {
          return yield* new RepositorySlugMismatch({
            githubId: target.id,
            expected: actual,
            actual: target.slug,
          })
        }
        return repository
      },
    )

    const resolveWebhook = Effect.fn("GitHubPullRequest.resolveWebhook")(
      function* (event: PullRequestWebhookEvent.PullRequestWebhookEvent) {
        const repository = yield* resolveRepository(
          event.payload.repository,
          event.payload.installation,
        )
        return {
          deliveryId: event.id,
          repository,
          number: event.payload.number,
          title: event.payload.pull_request.title,
          body: event.payload.pull_request.body,
          baseRef: event.payload.pull_request.base.ref,
          headSha: event.payload.pull_request.head.sha,
        }
      },
    )

    const getEvidence = Effect.fn("GitHubPullRequest.getEvidence")(
      function* (pullRequest: DomainGitHubPullRequest.GitHubPullRequest) {
        const streamedFiles = yield* client
          .listPullRequestFiles(pullRequest.repository, pullRequest.number)
          .pipe(
            Stream.take(DomainGitHubPullRequest.MAX_FILES + 1),
            Stream.runCollect,
          )
        const hasMore = streamedFiles.length > DomainGitHubPullRequest.MAX_FILES
        const rawFiles = streamedFiles.slice(
          0,
          DomainGitHubPullRequest.MAX_FILES,
        )

        const files: Array<DomainGitHubPullRequest.ChangedFileEvidence> = []
        let remainingPatchChars = DomainGitHubPullRequest.MAX_TOTAL_PATCH_CHARS
        for (const file of rawFiles) {
          const [bounded, remaining] = boundFile(file, remainingPatchChars)
          files.push(bounded)
          remainingPatchChars = remaining
        }

        return {
          type: "pull_request" as const,
          number: pullRequest.number,
          title: pullRequest.title,
          body: pullRequest.body,
          baseRef: pullRequest.baseRef,
          headSha: pullRequest.headSha,
          files,
          filesTruncated: hasMore,
        }
      },
      (effect, pullRequest) => {
        const repository = pullRequest.repository.slug
        return Effect.mapError(
          effect,
          (error: GitHubClientError) =>
            new PullRequestEvidenceError({
              repository,
              number: pullRequest.number,
              ...(error.status === undefined ? {} : { status: error.status }),
              retryable: error.retryable,
              message: `Pull request evidence for ${repository}#${pullRequest.number} is unavailable. ${error.message}`,
            }),
        )
      },
    )

    const mapLabelsError =
      (
        pullRequest: DomainGitHubPullRequest.GitHubPullRequest,
        operation: GitHubPullRequestLabelsError["operation"],
        label?: string,
      ) =>
      (error: GitHubClientError) => {
        const repository = pullRequest.repository.slug
        return new GitHubPullRequestLabelsError({
          operation,
          repository,
          number: pullRequest.number,
          ...(label === undefined ? {} : { label }),
          ...(error.status === undefined ? {} : { status: error.status }),
          retryable: error.retryable,
          message: `GitHub could not ${operation.replace("-", " ")} labels on ${repository}#${pullRequest.number}. ${error.message}`,
        })
      }

    const getLabels = Effect.fn("GitHubPullRequest.getLabels")(
      function* (pullRequest: DomainGitHubPullRequest.GitHubPullRequest) {
        const labels = yield* client
          .listItemLabels(pullRequest.repository, pullRequest.number)
          .pipe(Stream.runCollect)
        return new Set(labels.map((label) => label.name))
      },
      (effect, pullRequest) =>
        Effect.mapError(effect, mapLabelsError(pullRequest, "get-current")),
    )

    const applyLabels = Effect.fn("GitHubPullRequest.applyLabels")(function* (
      pullRequest: DomainGitHubPullRequest.GitHubPullRequest,
      changes: LabelClassification.LabelChanges,
    ) {
      const current = yield* getLabels(pullRequest)
      const additions = [...new Set(changes.add)].filter(
        (label) => !current.has(label),
      )
      const removals = [...new Set(changes.remove)].filter(
        (label) => current.has(label) && !additions.includes(label),
      )

      for (const label of additions) {
        yield* client
          .addItemLabels(pullRequest.repository, pullRequest.number, [label])
          .pipe(Effect.mapError(mapLabelsError(pullRequest, "add", label)))
      }

      const removed: Array<GitHubLabel.GitHubLabelName> = []
      for (const label of removals) {
        const didRemove = yield* client
          .removeItemLabel(pullRequest.repository, pullRequest.number, label)
          .pipe(Effect.mapError(mapLabelsError(pullRequest, "remove", label)))
        if (didRemove) removed.push(label)
      }

      return { added: additions, removed }
    })

    return {
      resolveRepository,
      resolveWebhook,
      getEvidence,
      getLabels,
      applyLabels,
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([GitHubRepositoriesRepo.layer, GitHubClient.layer]),
  )
}
