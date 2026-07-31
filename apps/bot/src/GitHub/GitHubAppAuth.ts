import * as NodeCrypto from "node:crypto"
import * as GitHubAppAuthDomain from "@slopcop/domain/GitHub/GitHubAppAuth"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Encoding from "effect/Encoding"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as SynchronizedRef from "effect/SynchronizedRef"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"

const GITHUB_API_URL = "https://api.github.com"
const TOKEN_REFRESH_SKEW_MILLIS = 60_000

export class GitHubAppAuthError extends Schema.TaggedErrorClass<GitHubAppAuthError>()(
  "GitHubAppAuthError",
  {
    operation: Schema.Literals(["create-jwt", "exchange-installation-token"]),
    status: Schema.optionalKey(Schema.Int),
    retryable: Schema.Boolean,
    message: Schema.String,
  },
) {}

interface CachedInstallationToken {
  readonly token: Redacted.Redacted<string>
  readonly expiresAtMillis: number
}

export class GitHubAppAuth extends Context.Service<
  GitHubAppAuth,
  {
    readonly appId: number
    readonly getInstallationToken: (
      installationId: GitHubRepository.GitHubInstallationId,
    ) => Effect.Effect<Redacted.Redacted<string>, GitHubAppAuthError>
  }
>()("@slopcop/bot/GitHub/GitHubAppAuth", {
  make: Effect.gen(function* () {
    const appId = yield* Config.schema(
      Schema.Int.check(Schema.isGreaterThan(0)),
      "GITHUB_APP_ID",
    )
    const privateKeyBase64 = yield* Config.redacted(
      "GITHUB_APP_PRIVATE_KEY_BASE64",
    )
    const httpClient = yield* HttpClient.HttpClient
    const retryingHttpClient = httpClient.pipe(
      HttpClient.retryTransient({ times: 2 }),
    )
    const cache = yield* SynchronizedRef.make(
      new Map<string, CachedInstallationToken>(),
    )
    const encodeJwtHeader = Schema.encodeUnknownEffect(
      GitHubAppAuthDomain.GitHubAppJwtHeaderJson,
    )
    const encodeJwtPayload = Schema.encodeUnknownEffect(
      GitHubAppAuthDomain.GitHubAppJwtPayloadJson,
    )

    const createJwt = Effect.fn("GitHubAppAuth.createJwt")(function* () {
      const nowMillis = yield* Clock.currentTimeMillis
      const nowSeconds = Math.floor(nowMillis / 1_000)
      const encodeClaims = <A>(effect: Effect.Effect<string, A>) =>
        effect.pipe(
          Effect.mapError(
            () =>
              new GitHubAppAuthError({
                operation: "create-jwt",
                retryable: false,
                message:
                  "GitHub App JWT claim encoding failed. Verify GITHUB_APP_ID contains a valid GitHub App identifier.",
              }),
          ),
        )
      const header = Encoding.encodeBase64Url(
        yield* encodeClaims(encodeJwtHeader({ alg: "RS256", typ: "JWT" })),
      )
      const payload = Encoding.encodeBase64Url(
        yield* encodeClaims(
          encodeJwtPayload({
            iat: nowSeconds - 60,
            exp: nowSeconds + 540,
            iss: String(appId),
          }),
        ),
      )
      const unsignedToken = `${header}.${payload}`

      return yield* Effect.try({
        try: () => {
          const key = NodeCrypto.createPrivateKey(
            Buffer.from(Redacted.value(privateKeyBase64), "base64").toString(
              "utf8",
            ),
          )
          const signature = NodeCrypto.sign(
            "RSA-SHA256",
            Buffer.from(unsignedToken, "utf8"),
            key,
          )
          return Redacted.make(
            `${unsignedToken}.${Encoding.encodeBase64Url(signature)}`,
          )
        },
        catch: () =>
          new GitHubAppAuthError({
            operation: "create-jwt",
            retryable: false,
            message:
              "GitHub App JWT signing failed. Verify GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_BASE64 contain valid GitHub App credentials.",
          }),
      })
    })

    const decodeAuthResponse = HttpClientResponse.schemaBodyJson(
      GitHubAppAuthDomain.GitHubInstallationTokenResponse,
    )

    const exchangeToken = Effect.fn("GitHubAppAuth.exchangeToken")(function* (
      installationId: string,
    ) {
      const jwt = yield* createJwt()
      const request = HttpClientRequest.post(
        `${GITHUB_API_URL}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      ).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bearerToken(jwt),
        HttpClientRequest.setHeader("x-github-api-version", "2022-11-28"),
        HttpClientRequest.setHeader("user-agent", "slopcop"),
      )

      const response = yield* retryingHttpClient.execute(request).pipe(
        Effect.timeout("30 seconds"),
        Effect.mapError(
          () =>
            new GitHubAppAuthError({
              operation: "exchange-installation-token",
              retryable: true,
              message:
                "GitHub installation authentication did not complete. Retry the operation; no token was cached.",
            }),
        ),
      )

      if (response.status !== 201) {
        return yield* new GitHubAppAuthError({
          operation: "exchange-installation-token",
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
          message: `GitHub rejected installation authentication with status ${response.status}. Verify the App installation and permissions before retrying.`,
        })
      }

      const decoded = yield* decodeAuthResponse(response).pipe(
        Effect.mapError(
          () =>
            new GitHubAppAuthError({
              operation: "exchange-installation-token",
              status: response.status,
              retryable: true,
              message:
                "GitHub returned an invalid installation token response. Retry the operation; no token was cached.",
            }),
        ),
      )

      return {
        token: Redacted.make(decoded.token),
        expiresAtMillis: DateTime.toEpochMillis(decoded.expires_at),
      }
    })

    const getInstallationToken = Effect.fn(
      "GitHubAppAuth.getInstallationToken",
    )(function* (installationId: string) {
      return yield* SynchronizedRef.modifyEffect(
        cache,
        Effect.fnUntraced(function* (tokens) {
          const now = yield* Clock.currentTimeMillis
          const cached = tokens.get(installationId)
          if (
            cached !== undefined &&
            cached.expiresAtMillis - TOKEN_REFRESH_SKEW_MILLIS > now
          ) {
            return [cached.token, tokens] as const
          }

          const fresh = yield* exchangeToken(installationId)
          const updated = new Map(tokens)
          updated.set(installationId, fresh)
          return [fresh.token, updated] as const
        }),
      )
    })

    return { appId, getInstallationToken }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(FetchHttpClient.layer),
  )
}
