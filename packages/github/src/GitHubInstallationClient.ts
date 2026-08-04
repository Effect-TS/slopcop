import * as GitHubInstallation from "@slopcop/domain/GitHub/GitHubInstallation"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { GitHubAppAuth } from "./GitHubAppAuth.ts"

const GITHUB_API_URL = "https://api.github.com"
const PAGE_SIZE = 100

export class GitHubInstallationClientError extends Data.TaggedError(
  "GitHubInstallationClientError",
)<{
  readonly operation: "ListInstallations" | "ListRepositories"
  readonly status?: number
  readonly message: string
}> {}

export class GitHubInstallationClient extends Context.Service<
  GitHubInstallationClient,
  {
    readonly listInstallations: () => Effect.Effect<
      ReadonlyArray<GitHubInstallation.GitHubInstallationSummary>,
      GitHubInstallationClientError
    >
    readonly listRepositories: (
      installationId: GitHubRepository.GitHubInstallationId,
    ) => Effect.Effect<
      ReadonlyArray<GitHubInstallation.GitHubInstallationRepository>,
      GitHubInstallationClientError
    >
  }
>()("@slopcop/github/GitHubInstallationClient", {
  make: Effect.gen(function* () {
    const auth = yield* GitHubAppAuth
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient({ times: 2 }),
      HttpClient.mapRequest((request) =>
        request.pipe(
          HttpClientRequest.acceptJson,
          HttpClientRequest.setHeader("x-github-api-version", "2022-11-28"),
          HttpClientRequest.setHeader("user-agent", "slopcop"),
        ),
      ),
    )

    const executePage = Effect.fn("GitHubInstallationClient.executePage")(
      function* (
        operation: GitHubInstallationClientError["operation"],
        token: Redacted.Redacted<string>,
        url: string,
      ) {
        const response = yield* client
          .execute(
            HttpClientRequest.get(url).pipe(
              HttpClientRequest.bearerToken(token),
            ),
          )
          .pipe(
            Effect.timeout("30 seconds"),
            Effect.mapError(
              () =>
                new GitHubInstallationClientError({
                  operation,
                  message: `GitHub ${operation} did not complete. Retry synchronization; persisted repository state is unchanged.`,
                }),
            ),
          )

        if (response.status !== 200) {
          return yield* new GitHubInstallationClientError({
            operation,
            status: response.status,
            message: `GitHub ${operation} returned HTTP ${response.status}. Verify the installation and App permissions before retrying.`,
          })
        }

        return response
      },
    )

    const collectPages = <A>(
      load: (
        page: number,
      ) => Effect.Effect<ReadonlyArray<A>, GitHubInstallationClientError>,
    ) =>
      Effect.gen(function* () {
        const items: Array<A> = []
        let page = 1
        while (true) {
          const current = yield* load(page)
          items.push(...current)
          if (current.length < PAGE_SIZE) return items
          page += 1
        }
      })

    const decodeInstallations = HttpClientResponse.schemaBodyJson(
      Schema.Array(GitHubInstallation.GitHubInstallationSummary),
    )
    const decodeRepositories = HttpClientResponse.schemaBodyJson(
      GitHubInstallation.ListInstallationRepositoriesResponse,
    )
    const mapDecodeError =
      (
        operation: GitHubInstallationClientError["operation"],
        response: HttpClientResponse.HttpClientResponse,
      ) =>
      <A, R>(effect: Effect.Effect<A, unknown, R>) =>
        effect.pipe(
          Effect.mapError(
            () =>
              new GitHubInstallationClientError({
                operation,
                status: response.status,
                message: `GitHub ${operation} returned an invalid response. Persisted repository state is unchanged.`,
              }),
          ),
        )

    const listInstallations = Effect.fn(
      "GitHubInstallationClient.listInstallations",
    )(function* () {
      const token = yield* auth.getAppToken().pipe(
        Effect.mapError(
          (error) =>
            new GitHubInstallationClientError({
              operation: "ListInstallations",
              message: error.message,
            }),
        ),
      )
      return yield* collectPages((page) =>
        executePage(
          "ListInstallations",
          token,
          `${GITHUB_API_URL}/app/installations?per_page=${PAGE_SIZE}&page=${page}`,
        ).pipe(
          Effect.flatMap((response) =>
            decodeInstallations(response).pipe(
              mapDecodeError("ListInstallations", response),
            ),
          ),
        ),
      )
    })

    const listRepositories = Effect.fn(
      "GitHubInstallationClient.listRepositories",
    )(function* (installationId: GitHubRepository.GitHubInstallationId) {
      const token = yield* auth.getInstallationToken(installationId).pipe(
        Effect.mapError(
          (error) =>
            new GitHubInstallationClientError({
              operation: "ListRepositories",
              ...(error.status === undefined ? {} : { status: error.status }),
              message: error.message,
            }),
        ),
      )
      return yield* collectPages((page) =>
        executePage(
          "ListRepositories",
          token,
          `${GITHUB_API_URL}/installation/repositories?per_page=${PAGE_SIZE}&page=${page}`,
        ).pipe(
          Effect.flatMap((response) =>
            decodeRepositories(response).pipe(
              mapDecodeError("ListRepositories", response),
            ),
          ),
          Effect.map((response) => response.repositories),
        ),
      )
    })

    return { listInstallations, listRepositories }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(GitHubAppAuth.layerNoDeps),
    Layer.provide(FetchHttpClient.layer),
  )
}
