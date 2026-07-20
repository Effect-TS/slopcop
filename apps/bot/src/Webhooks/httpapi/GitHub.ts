import * as NodeCrypto from "node:crypto"
import { RootApi } from "@slopcop/api/RootApi"
import {
  GitHubWebhookMiddleware,
  EventQueueUnavailable,
} from "@slopcop/api/Webhooks/GitHub"
import { InvalidWebhookSignature } from "@slopcop/api/Webhooks/Errors"
import {
  GitHubWebhookEvent,
  WebhookEventName,
} from "@slopcop/domain/GitHubWebhookEvent"
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

const decodeWebhookEvent = Schema.decodeUnknownEffect(GitHubWebhookEvent)
const isValidWebhookEventName = Schema.is(WebhookEventName)

export const GitHubWebhookMiddlewareLayer = Layer.effect(
  GitHubWebhookMiddleware,
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
        return yield* new InvalidWebhookSignature()
      }

      return yield* effect
    })
  }),
)

export const WebhooksApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "webhooks",
  Effect.fnUntraced(function* (handlers) {
    const events = yield* GitHubEvents

    return handlers.handle(
      "github",
      Effect.fnUntraced(function* ({ headers, payload }) {
        const id = headers["x-github-delivery"]
        const name = headers["x-github-event"]

        if (!isValidWebhookEventName(name)) {
          // Return a successful response to GitHub for unsupported events
          return yield* Effect.annotateLogs(
            Effect.logInfo("Ignored unsupported GitHub webhook event"),
            { id, event: name },
          )
        }

        const event = yield* decodeWebhookEvent({ id, name, payload }).pipe(
          Effect.catchCause(
            Effect.fnUntraced(function* (cause) {
              yield* Effect.annotateLogs(
                Effect.logWarning(
                  "Failed to decode GitHub webhook payload",
                  cause,
                ),
                { id, event: name },
              )
              return yield* new HttpApiError.BadRequest()
            }),
          ),
        )

        yield* Effect.mapError(
          events.enqueue(event),
          () => new EventQueueUnavailable(),
        )

        return yield* Effect.annotateLogs(
          Effect.logInfo("Queued GitHub webhook"),
          { id, event: event.name },
        )
      }),
    )
  }),
).pipe(Layer.provide(GitHubWebhookMiddlewareLayer))
