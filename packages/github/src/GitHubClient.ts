import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as GitHubPullRequest from "@slopcop/domain/GitHub/GitHubPullRequest"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { GitHubAppAuth, GitHubAppAuthError } from "./GitHubAppAuth.ts"

const GITHUB_API_URL = "https://api.github.com"
const PAGE_SIZE = 100
const MAX_ATTEMPTS = 3

const GitHubClientOperation = Schema.Literals([
  "GitHubClient.getRepositoryLabel",
  "GitHubClient.listRepositoryLabels",
  "GitHubClient.listPullRequestFiles",
  "GitHubClient.getPullRequest",
  "GitHubClient.listItemLabels",
  "GitHubClient.addItemLabels",
  "GitHubClient.removeItemLabel",
  "GitHubClient.listPullRequestsForCommit",
  "GitHubClient.listPullRequestReviews",
  "GitHubClient.getFileContent",
  "GitHubClient.listRequiredChecks",
  "GitHubClient.listCheckRuns",
  "GitHubClient.listCommitStatuses",
])
type GitHubClientOperation = typeof GitHubClientOperation.Type

export class GitHubClientError extends Schema.TaggedErrorClass<GitHubClientError>()(
  "GitHubClientError",
  {
    operation: GitHubClientOperation,
    status: Schema.optionalKey(Schema.Int),
    retryable: Schema.Boolean,
    message: Schema.String,
  },
) {}

const PullRequestSummary = Schema.Struct({
  number: Schema.Int,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  draft: Schema.Boolean,
  head: Schema.Struct({ sha: Schema.String }),
  base: Schema.Struct({ ref: Schema.String }),
})
export type PullRequestSummary = typeof PullRequestSummary.Type

export interface RequiredCheck {
  readonly context: string
  readonly integrationId: number | null
}

export interface CheckRun {
  readonly name: string
  readonly status: "queued" | "in_progress" | "completed"
  readonly conclusion:
    | "action_required"
    | "cancelled"
    | "failure"
    | "neutral"
    | "skipped"
    | "stale"
    | "startup_failure"
    | "success"
    | "timed_out"
    | null
  readonly appId: number | null
}

export interface CommitStatus {
  readonly context: string
  readonly state: "error" | "failure" | "pending" | "success"
}

export interface PullRequestReview {
  readonly id: number
  readonly reviewer: string
  readonly state:
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "COMMENTED"
    | "DISMISSED"
    | "PENDING"
}

const RequiredRules = Schema.Array(
  Schema.Struct({
    type: Schema.String,
    parameters: Schema.optionalKey(
      Schema.Struct({
        required_status_checks: Schema.Array(
          Schema.Struct({
            context: Schema.String,
            integration_id: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
          }),
        ),
      }),
    ),
  }),
)

const CheckRunsResponse = Schema.Struct({
  check_runs: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      status: Schema.Literals(["queued", "in_progress", "completed"]),
      conclusion: Schema.NullOr(
        Schema.Literals([
          "action_required",
          "cancelled",
          "failure",
          "neutral",
          "skipped",
          "stale",
          "startup_failure",
          "success",
          "timed_out",
        ]),
      ),
      app: Schema.NullOr(Schema.Struct({ id: Schema.Finite })),
    }),
  ),
})

const CombinedStatusResponse = Schema.Struct({
  statuses: Schema.Array(
    Schema.Struct({
      context: Schema.String,
      state: Schema.Literals(["error", "failure", "pending", "success"]),
    }),
  ),
})

const FileContentResponse = Schema.Struct({
  type: Schema.Literal("file"),
  encoding: Schema.Literal("base64"),
  content: Schema.String,
})

const PullRequestReviewsResponse = Schema.Array(
  Schema.Struct({
    id: Schema.Finite,
    user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
    state: Schema.Literals([
      "APPROVED",
      "CHANGES_REQUESTED",
      "COMMENTED",
      "DISMISSED",
      "PENDING",
    ]),
  }),
)

export class GitHubClient extends Context.Service<
  GitHubClient,
  {
    readonly getRepositoryLabel: (
      repository: GitHubRepository.GitHubRepository,
      label: GitHubLabel.GitHubLabelName,
    ) => Effect.Effect<
      Option.Option<GitHubLabel.GitHubLabel>,
      GitHubClientError
    >
    readonly listRepositoryLabels: (
      repository: GitHubRepository.GitHubRepository,
    ) => Stream.Stream<GitHubLabel.GitHubLabel, GitHubClientError>
    readonly listPullRequestFiles: (
      repository: GitHubRepository.GitHubRepository,
      number: number,
    ) => Stream.Stream<
      GitHubPullRequest.GitHubPullRequestFile,
      GitHubClientError
    >
    readonly getPullRequest: (
      repository: GitHubRepository.GitHubRepository,
      number: number,
    ) => Effect.Effect<PullRequestSummary, GitHubClientError>
    readonly listItemLabels: (
      repository: GitHubRepository.GitHubRepository,
      number: number,
    ) => Stream.Stream<GitHubLabel.GitHubLabel, GitHubClientError>
    readonly addItemLabels: (
      repository: GitHubRepository.GitHubRepository,
      number: number,
      labels: ReadonlyArray<GitHubLabel.GitHubLabelName>,
    ) => Effect.Effect<
      ReadonlyArray<GitHubLabel.GitHubLabel>,
      GitHubClientError
    >
    readonly removeItemLabel: (
      repository: GitHubRepository.GitHubRepository,
      number: number,
      label: GitHubLabel.GitHubLabelName,
    ) => Effect.Effect<boolean, GitHubClientError>
    readonly listPullRequestsForCommit: (
      repository: GitHubRepository.GitHubRepository,
      sha: string,
    ) => Effect.Effect<ReadonlyArray<PullRequestSummary>, GitHubClientError>
    readonly listPullRequestReviews: (
      repository: GitHubRepository.GitHubRepository,
      number: number,
    ) => Effect.Effect<ReadonlyArray<PullRequestReview>, GitHubClientError>
    readonly getFileContent: (
      repository: GitHubRepository.GitHubRepository,
      path: string,
      ref: string,
    ) => Effect.Effect<string, GitHubClientError>
    readonly listRequiredChecks: (
      repository: GitHubRepository.GitHubRepository,
      branch: string,
    ) => Effect.Effect<ReadonlyArray<RequiredCheck>, GitHubClientError>
    readonly listCheckRuns: (
      repository: GitHubRepository.GitHubRepository,
      sha: string,
    ) => Effect.Effect<ReadonlyArray<CheckRun>, GitHubClientError>
    readonly listCommitStatuses: (
      repository: GitHubRepository.GitHubRepository,
      sha: string,
    ) => Effect.Effect<ReadonlyArray<CommitStatus>, GitHubClientError>
  }
>()("@slopcop/github/GitHubClient", {
  make: Effect.gen(function* () {
    const auth = yield* GitHubAppAuth

    const httpClient = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(
          HttpClientRequest.acceptJson,
          HttpClientRequest.setHeader("x-github-api-version", "2022-11-28"),
          HttpClientRequest.setHeader("user-agent", "slopcop"),
        ),
      ),
    )

    const decodeGitHubLabel = HttpClientResponse.schemaBodyJson(
      GitHubLabel.GitHubLabel,
    )
    const decodeGitHubLabels = HttpClientResponse.schemaBodyJson(
      Schema.Array(GitHubLabel.GitHubLabel),
    )
    const decodeGitHubPullRequestFiles = HttpClientResponse.schemaBodyJson(
      Schema.Array(GitHubPullRequest.GitHubPullRequestFile),
    )
    const decodePullRequestSummaries = HttpClientResponse.schemaBodyJson(
      Schema.Array(PullRequestSummary),
    )
    const decodePullRequestSummary =
      HttpClientResponse.schemaBodyJson(PullRequestSummary)
    const decodePullRequestReviews = HttpClientResponse.schemaBodyJson(
      PullRequestReviewsResponse,
    )
    const decodeRequiredRules = HttpClientResponse.schemaBodyJson(RequiredRules)
    const decodeCheckRuns = HttpClientResponse.schemaBodyJson(CheckRunsResponse)
    const decodeCombinedStatus = HttpClientResponse.schemaBodyJson(
      CombinedStatusResponse,
    )
    const decodeFileContent =
      HttpClientResponse.schemaBodyJson(FileContentResponse)
    const decodeFileContentText = Schema.decodeUnknownEffect(
      Schema.StringFromBase64,
    )

    const execute = Effect.fn("GitHubClient.execute")(function* (
      repository: GitHubRepository.GitHubRepository,
      operation: GitHubClientOperation,
      request: HttpClientRequest.HttpClientRequest,
    ) {
      const token = yield* auth
        .getInstallationToken(repository.installationId)
        .pipe(
          Effect.mapError(
            (error: GitHubAppAuthError) =>
              new GitHubClientError({
                operation,
                ...(error.status === undefined ? {} : { status: error.status }),
                retryable: error.retryable,
                message: `GitHub ${operation} could not authenticate the configured installation. ${error.message}`,
              }),
          ),
        )

      const authenticated = HttpClientRequest.bearerToken(request, token)

      const requestOnce = httpClient.execute(authenticated).pipe(
        Effect.timeout("10 seconds"),
        Effect.mapError(
          () =>
            new RetryableGitHubRequest({
              error: new GitHubClientError({
                operation,
                retryable: true,
                message: `GitHub ${operation} did not complete. Retry the operation; no successful result was returned.`,
              }),
            }),
        ),
        Effect.flatMap((response) =>
          isRetryableResponse(response)
            ? Effect.fail(
                new RetryableGitHubRequest({
                  error: responseStatusError(operation, response),
                  response,
                }),
              )
            : Effect.succeed(response),
        ),
      )

      return yield* requestOnce.pipe(
        Effect.retry(requestRetrySchedule),
        Effect.mapError((failure) => failure.error),
      )
    })

    const getRepositoryLabel = Effect.fn("GitHubClient.getRepositoryLabel")(
      function* (
        repository: GitHubRepository.GitHubRepository,
        label: GitHubLabel.GitHubLabelName,
      ) {
        const operation = "GitHubClient.getRepositoryLabel"

        const response = yield* execute(
          repository,
          operation,
          HttpClientRequest.get(
            `${GITHUB_API_URL}${repositoryPath(repository)}/labels/${encodeURIComponent(label)}`,
          ),
        )

        if (response.status === 404) {
          return Option.none()
        }

        yield* requireStatus(operation, response, 200)

        return Option.some(
          yield* decodeGitHubLabel(response).pipe(
            mapResponseDecodeError(operation, response),
          ),
        )
      },
    )

    const listRepositoryLabels = (
      repository: GitHubRepository.GitHubRepository,
    ) =>
      Stream.paginate(
        1,
        Effect.fnUntraced(function* (pageNumber) {
          const operation = "GitHubClient.listRepositoryLabels"

          const request = HttpClientRequest.get(
            `${GITHUB_API_URL}${repositoryPath(repository)}/labels`,
          ).pipe(
            HttpClientRequest.setUrlParams({
              per_page: PAGE_SIZE,
              page: pageNumber,
            }),
          )

          const response = yield* execute(repository, operation, request)

          yield* requireStatus(operation, response, 200)

          const labels = yield* decodeGitHubLabels(response).pipe(
            mapResponseDecodeError(operation, response),
          )

          return [labels, nextPage(pageNumber, response)] as const
        }),
      )

    const listPullRequestFiles = (
      repository: GitHubRepository.GitHubRepository,
      number: number,
    ) =>
      Stream.paginate(1, (pageNumber) =>
        Effect.gen(function* () {
          const operation = "GitHubClient.listPullRequestFiles"

          const request = HttpClientRequest.get(
            `${GITHUB_API_URL}${repositoryPath(repository)}/pulls/${number}/files`,
          ).pipe(
            HttpClientRequest.setUrlParams({
              per_page: PAGE_SIZE,
              page: pageNumber,
            }),
          )

          const response = yield* execute(repository, operation, request)

          yield* requireStatus(operation, response, 200)

          const files = yield* decodeGitHubPullRequestFiles(response).pipe(
            mapResponseDecodeError(operation, response),
          )

          return [files, nextPage(pageNumber, response)] as const
        }),
      )

    const getPullRequest = Effect.fn("GitHubClient.getPullRequest")(function* (
      repository: GitHubRepository.GitHubRepository,
      number: number,
    ) {
      const operation = "GitHubClient.getPullRequest"
      const response = yield* execute(
        repository,
        operation,
        HttpClientRequest.get(
          `${GITHUB_API_URL}${repositoryPath(repository)}/pulls/${number}`,
        ),
      )
      yield* requireStatus(operation, response, 200)
      return yield* decodePullRequestSummary(response).pipe(
        mapResponseDecodeError(operation, response),
      )
    })

    const listItemLabels = (
      repository: GitHubRepository.GitHubRepository,
      number: number,
    ) =>
      Stream.paginate(1, (pageNumber) =>
        Effect.gen(function* () {
          const operation = "GitHubClient.listItemLabels"

          const request = HttpClientRequest.get(
            `${GITHUB_API_URL}${repositoryPath(repository)}/issues/${number}/labels`,
          ).pipe(
            HttpClientRequest.setUrlParams({
              per_page: PAGE_SIZE,
              page: pageNumber,
            }),
          )

          const response = yield* execute(repository, operation, request)

          yield* requireStatus(operation, response, 200)

          const labels = yield* decodeGitHubLabels(response).pipe(
            mapResponseDecodeError(operation, response),
          )

          return [labels, nextPage(pageNumber, response)] as const
        }),
      )

    const addItemLabels = Effect.fn("GitHubClient.addItemLabels")(function* (
      repository: GitHubRepository.GitHubRepository,
      number: number,
      labels: ReadonlyArray<GitHubLabel.GitHubLabelName>,
    ) {
      const operation = "GitHubClient.addItemLabels"

      const request = yield* HttpClientRequest.post(
        `${GITHUB_API_URL}${repositoryPath(repository)}/issues/${number}/labels`,
      ).pipe(
        HttpClientRequest.bodyJson({ labels }),
        Effect.mapError(
          () =>
            new GitHubClientError({
              operation,
              retryable: false,
              message: "GitHub add item labels request encoding failed.",
            }),
        ),
      )
      const response = yield* execute(repository, operation, request)

      yield* requireStatus(operation, response, 200)

      return yield* decodeGitHubLabels(response).pipe(
        mapResponseDecodeError(operation, response),
      )
    })

    const removeItemLabel = Effect.fn("GitHubClient.removeItemLabel")(
      function* (
        repository: GitHubRepository.GitHubRepository,
        number: number,
        label: GitHubLabel.GitHubLabelName,
      ) {
        const operation = "GitHubClient.removeItemLabel"

        const response = yield* execute(
          repository,
          operation,
          HttpClientRequest.delete(
            `${GITHUB_API_URL}${repositoryPath(repository)}/issues/${number}/labels/${encodeURIComponent(label)}`,
          ),
        )

        if (response.status === 404) {
          return false
        }

        yield* requireStatus(operation, response, 200)

        return true
      },
    )

    const listPullRequestsForCommit = Effect.fn(
      "GitHubClient.listPullRequestsForCommit",
    )(function* (repository: GitHubRepository.GitHubRepository, sha: string) {
      const operation = "GitHubClient.listPullRequestsForCommit"
      const response = yield* execute(
        repository,
        operation,
        HttpClientRequest.get(
          `${GITHUB_API_URL}${repositoryPath(repository)}/commits/${encodeURIComponent(sha)}/pulls`,
        ).pipe(
          HttpClientRequest.setUrlParams({ per_page: PAGE_SIZE }),
          HttpClientRequest.setHeader("accept", "application/vnd.github+json"),
        ),
      )
      yield* requireStatus(operation, response, 200)
      return yield* decodePullRequestSummaries(response).pipe(
        mapResponseDecodeError(operation, response),
      )
    })

    const listPullRequestReviews = Effect.fn(
      "GitHubClient.listPullRequestReviews",
    )(function* (
      repository: GitHubRepository.GitHubRepository,
      number: number,
    ) {
      return yield* Stream.paginate(1, (pageNumber) =>
        Effect.gen(function* () {
          const operation = "GitHubClient.listPullRequestReviews"
          const response = yield* execute(
            repository,
            operation,
            HttpClientRequest.get(
              `${GITHUB_API_URL}${repositoryPath(repository)}/pulls/${number}/reviews`,
            ).pipe(
              HttpClientRequest.setUrlParams({
                per_page: PAGE_SIZE,
                page: pageNumber,
              }),
            ),
          )
          yield* requireStatus(operation, response, 200)
          const reviews = yield* decodePullRequestReviews(response).pipe(
            mapResponseDecodeError(operation, response),
          )
          return [
            reviews.map((review) => ({
              id: review.id,
              reviewer: review.user?.login ?? `deleted:${review.id}`,
              state: review.state,
            })),
            nextPage(pageNumber, response),
          ] as const
        }),
      ).pipe(Stream.runCollect)
    })

    const getFileContent = Effect.fn("GitHubClient.getFileContent")(function* (
      repository: GitHubRepository.GitHubRepository,
      path: string,
      ref: string,
    ) {
      const operation = "GitHubClient.getFileContent"
      const response = yield* execute(
        repository,
        operation,
        HttpClientRequest.get(
          `${GITHUB_API_URL}${repositoryPath(repository)}/contents/${path
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
        ).pipe(HttpClientRequest.setUrlParam("ref", ref)),
      )
      yield* requireStatus(operation, response, 200)
      const file = yield* decodeFileContent(response).pipe(
        mapResponseDecodeError(operation, response),
      )
      return yield* decodeFileContentText(file.content.replace(/\s/g, "")).pipe(
        Effect.mapError(
          () =>
            new GitHubClientError({
              operation,
              status: response.status,
              retryable: false,
              message: `GitHub returned invalid base64 content for '${path}' in ${repository.slug}.`,
            }),
        ),
      )
    })

    const listRequiredChecks = (
      repository: GitHubRepository.GitHubRepository,
      branch: string,
    ) =>
      Stream.paginate(
        1,
        Effect.fnUntraced(function* (pageNumber) {
          const operation = "GitHubClient.listRequiredChecks"
          const response = yield* execute(
            repository,
            operation,
            HttpClientRequest.get(
              `${GITHUB_API_URL}${repositoryPath(repository)}/rules/branches/${encodeURIComponent(branch)}`,
            ).pipe(
              HttpClientRequest.setUrlParams({
                per_page: PAGE_SIZE,
                page: pageNumber,
              }),
            ),
          )
          yield* requireStatus(operation, response, 200)
          const rules = yield* decodeRequiredRules(response).pipe(
            mapResponseDecodeError(operation, response),
          )
          return [
            rules.flatMap((rule) =>
              rule.type !== "required_status_checks" ||
              rule.parameters === undefined
                ? []
                : rule.parameters.required_status_checks.map((check) => ({
                    context: check.context,
                    integrationId: check.integration_id ?? null,
                  })),
            ),
            nextPage(pageNumber, response),
          ] as const
        }),
      ).pipe(
        Stream.runCollect,
        Effect.withSpan("GitHubClient.listRequiredChecks"),
      )

    const listCheckRuns = Effect.fn("GitHubClient.listCheckRuns")(function* (
      repository: GitHubRepository.GitHubRepository,
      sha: string,
    ) {
      return yield* Stream.paginate(1, (pageNumber) =>
        Effect.gen(function* () {
          const operation = "GitHubClient.listCheckRuns"
          const response = yield* execute(
            repository,
            operation,
            HttpClientRequest.get(
              `${GITHUB_API_URL}${repositoryPath(repository)}/commits/${encodeURIComponent(sha)}/check-runs`,
            ).pipe(
              HttpClientRequest.setUrlParams({
                per_page: PAGE_SIZE,
                page: pageNumber,
                filter: "latest",
              }),
            ),
          )
          yield* requireStatus(operation, response, 200)
          const result = yield* decodeCheckRuns(response).pipe(
            mapResponseDecodeError(operation, response),
          )
          return [
            result.check_runs.map((check) => ({
              name: check.name,
              status: check.status,
              conclusion: check.conclusion,
              appId: check.app?.id ?? null,
            })),
            nextPage(pageNumber, response),
          ] as const
        }),
      ).pipe(Stream.runCollect)
    })

    const listCommitStatuses = Effect.fn("GitHubClient.listCommitStatuses")(
      function* (repository: GitHubRepository.GitHubRepository, sha: string) {
        return yield* Stream.paginate(1, (pageNumber) =>
          Effect.gen(function* () {
            const operation = "GitHubClient.listCommitStatuses"
            const response = yield* execute(
              repository,
              operation,
              HttpClientRequest.get(
                `${GITHUB_API_URL}${repositoryPath(repository)}/commits/${encodeURIComponent(sha)}/status`,
              ).pipe(
                HttpClientRequest.setUrlParams({
                  per_page: PAGE_SIZE,
                  page: pageNumber,
                }),
              ),
            )
            yield* requireStatus(operation, response, 200)
            const result = yield* decodeCombinedStatus(response).pipe(
              mapResponseDecodeError(operation, response),
            )
            return [result.statuses, nextPage(pageNumber, response)] as const
          }),
        ).pipe(Stream.runCollect)
      },
    )

    return {
      getRepositoryLabel,
      listRepositoryLabels,
      listPullRequestFiles,
      getPullRequest,
      listItemLabels,
      addItemLabels,
      removeItemLabel,
      listPullRequestsForCommit,
      listPullRequestReviews,
      getFileContent,
      listRequiredChecks,
      listCheckRuns,
      listCommitStatuses,
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(GitHubAppAuth.layerNoDeps),
    Layer.provide(FetchHttpClient.layer),
  )
}

class RetryableGitHubRequest extends Data.TaggedError(
  "RetryableGitHubRequest",
)<{
  readonly error: GitHubClientError
  readonly response?: HttpClientResponse.HttpClientResponse
}> {}

const requestRetrySchedule: Schedule.Schedule<number, RetryableGitHubRequest> =
  Schedule.recurs(MAX_ATTEMPTS - 1).pipe(
    Schedule.modifyDelay(
      ({ input, now }: Schedule.Metadata<number, RetryableGitHubRequest>) =>
        Effect.succeed(
          Duration.millis(
            input.response === undefined
              ? 1_000
              : retryDelayMillis(input.response, now),
          ),
        ),
    ),
  )

const isRetryableResponse = (response: HttpClientResponse.HttpClientResponse) =>
  response.status === 408 ||
  response.status === 429 ||
  response.status >= 500 ||
  (response.status === 403 &&
    (response.headers["retry-after"] !== undefined ||
      response.headers["x-ratelimit-remaining"] === "0"))

const retryDelayMillis = (
  response: HttpClientResponse.HttpClientResponse,
  nowMillis: number,
) => {
  const retryAfter = response.headers["retry-after"]
  if (retryAfter !== undefined) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000
    }
  }

  const reset = response.headers["x-ratelimit-reset"]
  if (reset !== undefined) {
    const epochSeconds = Number(reset)
    if (Number.isFinite(epochSeconds)) {
      return Math.max(epochSeconds * 1_000 - nowMillis, 0)
    }
  }

  return 1_000
}

const repositoryPath = (repository: GitHubRepository.GitHubRepository) =>
  `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`

const requireStatus = (
  operation: GitHubClientOperation,
  response: HttpClientResponse.HttpClientResponse,
  expected: number,
) =>
  response.status === expected
    ? Effect.void
    : Effect.fail(responseStatusError(operation, response))

const responseStatusError = (
  operation: GitHubClientOperation,
  response: HttpClientResponse.HttpClientResponse,
) =>
  new GitHubClientError({
    operation,
    status: response.status,
    retryable: isRetryableResponse(response),
    message: `GitHub ${operation} failed with status ${response.status}. Verify repository access and App permissions before retrying.`,
  })

const mapResponseDecodeError = (
  operation: GitHubClientOperation,
  response: HttpClientResponse.HttpClientResponse,
) =>
  Effect.mapError(
    () =>
      new GitHubClientError({
        operation,
        status: response.status,
        retryable: false,
        message: `GitHub ${operation} returned a response that did not match the expected schema.`,
      }),
  )

const nextPage = (
  page: number,
  response: HttpClientResponse.HttpClientResponse,
) =>
  response.headers.link
    ?.split(",")
    .some((link) => link.includes('rel="next"')) === true
    ? Option.some(page + 1)
    : Option.none<number>()
