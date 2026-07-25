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
  "GitHubClient.listItemLabels",
  "GitHubClient.addItemLabels",
  "GitHubClient.removeItemLabel",
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
  }
>()("@slopcop/bot/GitHub/GitHubClient", {
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

    return {
      getRepositoryLabel,
      listRepositoryLabels,
      listPullRequestFiles,
      listItemLabels,
      addItemLabels,
      removeItemLabel,
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
