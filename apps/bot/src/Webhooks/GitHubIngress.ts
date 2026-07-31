import * as NodeCrypto from "node:crypto"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import type { GitHubEventEnqueueError } from "../GitHub/GitHubEventQueue.ts"

export const MAX_GITHUB_WEBHOOK_BODY_BYTES = 1024 * 1024
const WEBHOOK_PATH = "/api/v1/webhooks/github"
const HMAC_SHA256_PATTERN = /^sha256=[0-9a-fA-F]{64}$/

class PayloadTooLarge extends Error {}

const response = (status: number, message: string) =>
  HttpServerResponse.text(message, { status })

const readRequestBytes = (request: Request) =>
  Effect.tryPromise({
    try: async () => {
      if (request.body === null) {
        return new Uint8Array()
      }

      const reader = request.body.getReader()
      const read = async (
        chunks: ReadonlyArray<Uint8Array>,
        size: number,
      ): Promise<ReadonlyArray<Uint8Array>> => {
        const result = await reader.read()
        if (result.done) {
          return chunks
        }
        const nextSize = size + result.value.byteLength
        if (nextSize > MAX_GITHUB_WEBHOOK_BODY_BYTES) {
          await reader.cancel()
          throw new PayloadTooLarge()
        }
        return read([...chunks, result.value], nextSize)
      }

      const chunks = await read([], 0)
      const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
      const bytes = new Uint8Array(size)
      chunks.reduce((offset, chunk) => {
        bytes.set(chunk, offset)
        return offset + chunk.byteLength
      }, 0)
      return bytes
    },
    catch: (cause) => cause,
  })

const hasValidSignature = (
  signature: string,
  body: Uint8Array,
  secret: Redacted.Redacted<string>,
) => {
  if (!HMAC_SHA256_PATTERN.test(signature)) {
    return false
  }
  const digest = NodeCrypto.createHmac("sha256", Redacted.value(secret))
    .update(body)
    .digest("hex")
  const expected = Buffer.from(`sha256=${digest}`, "utf8")
  const actual = Buffer.from(signature, "utf8")
  return (
    expected.length === actual.length &&
    NodeCrypto.timingSafeEqual(expected, actual)
  )
}

export const handleGitHubWebhook = <R>(
  request: Request,
  secret: Redacted.Redacted<string>,
  enqueue: (
    event: GitHubWebhookEvent.GitHubWebhookEvent,
  ) => Effect.Effect<void, GitHubEventEnqueueError, R>,
) =>
  Effect.gen(function* () {
    const url = new URL(request.url)
    if (url.pathname !== WEBHOOK_PATH) {
      return response(404, "Not Found")
    }
    if (request.method !== "POST") {
      return response(405, "Method Not Allowed")
    }

    const declaredLength = request.headers.get("content-length")
    if (
      declaredLength !== null &&
      Number.parseInt(declaredLength, 10) > MAX_GITHUB_WEBHOOK_BODY_BYTES
    ) {
      return response(413, "Payload Too Large")
    }

    const signature = request.headers.get("x-hub-signature-256")
    const deliveryId = request.headers.get("x-github-delivery")
    const eventName = request.headers.get("x-github-event")
    if (signature === null || deliveryId === null || eventName === null) {
      return response(400, "Missing required GitHub webhook headers")
    }

    const body = yield* readRequestBytes(request).pipe(
      Effect.catch((cause) =>
        cause instanceof PayloadTooLarge
          ? Effect.succeed(undefined)
          : Effect.fail(cause),
      ),
    )
    if (body === undefined) {
      return response(413, "Payload Too Large")
    }
    if (!hasValidSignature(signature, body, secret)) {
      return response(401, "Invalid webhook signature")
    }

    const payload = yield* Effect.try({
      try: () => JSON.parse(new TextDecoder().decode(body)),
      catch: () => undefined,
    })
    if (payload === undefined) {
      return response(400, "Invalid JSON payload")
    }

    const event = yield* Schema.decodeUnknownEffect(
      GitHubWebhookEvent.GitHubWebhookEvent,
    )({ id: deliveryId, name: eventName, payload }).pipe(
      Effect.catch((cause) =>
        Effect.annotateLogs(
          Effect.logDebug(
            "Ignored GitHub webhook event outside supported schema",
            cause,
          ),
          { id: deliveryId, event: eventName },
        ).pipe(Effect.as(undefined)),
      ),
    )
    if (event === undefined) {
      return response(202, "Accepted")
    }

    return yield* enqueue(event).pipe(
      Effect.as(response(202, "Accepted")),
      Effect.catch(() => Effect.succeed(response(503, "Queue unavailable"))),
    )
  }).pipe(
    Effect.catch(() => Effect.succeed(response(400, "Invalid request body"))),
  )
