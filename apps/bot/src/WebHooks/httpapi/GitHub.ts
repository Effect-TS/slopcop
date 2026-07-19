import * as NodeCrypto from "node:crypto"
import { RootApi } from "@slopcop/api/RootApi"
import {
  GitHubWebHookMiddleware,
  InvalidGitHubWebHookSignature,
} from "@slopcop/api/WebHooks/GitHub"
import { WebhookQueueUnavailable } from "@slopcop/api/WebHooks/GitHub"
import { GitHubWebHookEvent } from "@slopcop/domain/GitHubWebhookEvent"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError"
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest"
import { GitHubEvents } from "../../GitHub/GitHubEvents.ts"

const HMAC_SHA256_PATTERN = /^[0-9a-fA-F]{64}$/

const GitHubWebhookSignature = Schema.TemplateLiteral([
  Schema.Literal("sha256="),
  Schema.String.check(Schema.isPattern(HMAC_SHA256_PATTERN)),
])

const GitHubWebhookHeaders = Schema.Struct({
  "x-hub-signature-256": GitHubWebhookSignature,
})

export const GitHubWebHookMiddlewareLayer = Layer.effect(
  GitHubWebHookMiddleware,
  Effect.gen(function* () {
    const secret = yield* Config.redacted("GITHUB_WEBHOOK_SECRET")

    const decodeHeaders = HttpServerRequest.schemaHeaders(
      GitHubWebhookHeaders,
    ).pipe(
      Effect.catchCause(
        Effect.fnUntraced(function* (cause) {
          yield* Effect.logError(
            "Failed to parse GitHub webhook headers",
            cause,
          )
          return yield* new HttpApiError.BadRequest()
        }),
      ),
    )

    function verifySignature(signature: string, body: string) {
      const digest = NodeCrypto.createHmac("sha256", Redacted.value(secret))
        .update(body, "utf8")
        .digest("hex")

      const expected = Buffer.from(`sha256=${digest}`, "utf8")
      const actual = Buffer.from(signature, "utf8")

      if (expected.length !== actual.length) {
        return false
      }

      // Prevent timing attacks
      return NodeCrypto.timingSafeEqual(expected, actual)
    }

    return Effect.fnUntraced(function* (effect) {
      const request = yield* HttpServerRequest.HttpServerRequest
      const headers = yield* decodeHeaders
      const signature = headers["x-hub-signature-256"]
      const body = yield* request.text.pipe(
        Effect.mapError(() => new HttpApiError.BadRequest()),
      )

      if (!verifySignature(signature, body)) {
        return yield* new InvalidGitHubWebHookSignature()
      }

      return yield* effect
    })
  }),
)

export const WebHooksApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "webhooks",
  Effect.fnUntraced(function* (handlers) {
    const events = yield* GitHubEvents

    return handlers.handle(
      "github",
      Effect.fnUntraced(function* ({ headers, payload }) {
        const event = new GitHubWebHookEvent({
          deliveryId: headers["x-github-delivery"],
          eventName: headers["x-github-event"],
          payload,
        })

        yield* events
          .enqueue(event)
          .pipe(Effect.mapError(() => new WebhookQueueUnavailable()))

        yield* Effect.logInfo("Queued GitHub webhook").pipe(
          Effect.annotateLogs({
            deliveryId: event.deliveryId,
            event: event.eventName,
          }),
        )
      }),
    )
  }),
).pipe(Layer.provide(GitHubWebHookMiddlewareLayer))
