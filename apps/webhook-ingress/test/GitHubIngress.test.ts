import * as NodeCrypto from "node:crypto"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import { GitHubEventEnqueueError } from "../src/GitHubEventQueue.ts"
import {
  MAX_GITHUB_WEBHOOK_BODY_BYTES,
  handleGitHubWebhook,
} from "../src/GitHubIngress.ts"

const secret = Redacted.make("webhook-secret")
const payload = JSON.stringify({
  hook_id: 1,
  zen: "Keep it logically awesome.",
})
const request = (overrides?: {
  readonly body?: string
  readonly signature?: string
  readonly method?: string
  readonly path?: string
  readonly contentLength?: string
  readonly eventName?: string
}) => {
  const body = overrides?.body ?? payload
  return new Request(
    `https://hooks.slopcop.test${overrides?.path ?? "/api/v1/webhooks/github"}`,
    {
      method: overrides?.method ?? "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-1",
        "x-github-event": overrides?.eventName ?? "ping",
        "x-hub-signature-256":
          overrides?.signature ??
          `sha256=${NodeCrypto.createHmac("sha256", Redacted.value(secret)).update(body).digest("hex")}`,
        ...(overrides?.contentLength === undefined
          ? {}
          : { "content-length": overrides.contentLength }),
      },
      body,
    },
  )
}

describe("GitHub webhook ingress", () => {
  it.effect("accepts a valid signed event and enqueues it once", () => {
    const enqueued: Array<GitHubWebhookEvent.GitHubWebhookEvent> = []

    return Effect.gen(function* () {
      const result = yield* handleGitHubWebhook(request(), secret, (event) =>
        Effect.sync(() => enqueued.push(event)).pipe(Effect.asVoid),
      )
      expect(result.status).toBe(202)
      expect(enqueued).toHaveLength(1)
      expect(enqueued[0]?.name).toBe("ping")
    })
  })

  it.effect("rejects an invalid signature without enqueueing", () => {
    let enqueueCount = 0

    return Effect.gen(function* () {
      const result = yield* handleGitHubWebhook(
        request({ signature: `sha256=${"0".repeat(64)}` }),
        secret,
        () => Effect.sync(() => enqueueCount++).pipe(Effect.asVoid),
      )
      expect(result.status).toBe(401)
      expect(enqueueCount).toBe(0)
    })
  })

  it.effect(
    "acknowledges an unsupported signed event without enqueueing",
    () => {
      let enqueueCount = 0

      return Effect.gen(function* () {
        const result = yield* handleGitHubWebhook(
          request({
            body: JSON.stringify({ action: "opened" }),
            eventName: "issues",
          }),
          secret,
          () => Effect.sync(() => enqueueCount++).pipe(Effect.asVoid),
        )
        expect(result.status).toBe(202)
        expect(enqueueCount).toBe(0)
      })
    },
  )

  it.effect("enqueues completed check suites", () => {
    const enqueued: Array<GitHubWebhookEvent.GitHubWebhookEvent> = []
    const repository = {
      id: 1,
      full_name: "Effect-TS/effect",
      private: false,
      owner: { login: "Effect-TS" },
      name: "effect",
    }
    const installation = { id: 2 }
    const body = JSON.stringify({
      action: "completed",
      check_suite: { head_sha: "sha" },
      repository,
      installation,
    })

    return Effect.gen(function* () {
      const result = yield* handleGitHubWebhook(
        request({ body, eventName: "check_suite" }),
        secret,
        (received) =>
          Effect.sync(() => enqueued.push(received)).pipe(Effect.asVoid),
      )
      expect(result.status).toBe(202)
      expect(enqueued).toHaveLength(1)
      expect(enqueued[0]?.name).toBe("check_suite")
    })
  })

  it.effect("does not enqueue redundant check lifecycle events", () => {
    let enqueueCount = 0
    const repository = {
      id: 1,
      full_name: "Effect-TS/effect",
      private: false,
      owner: { login: "Effect-TS" },
      name: "effect",
    }
    const installation = { id: 2 }
    const events = [
      {
        eventName: "check_run",
        payload: {
          action: "created",
          check_run: { head_sha: "sha" },
          repository,
          installation,
        },
      },
      ...["requested", "rerequested"].map((action) => ({
        eventName: "check_suite",
        payload: {
          action,
          check_suite: { head_sha: "sha" },
          repository,
          installation,
        },
      })),
    ]

    return Effect.gen(function* () {
      for (const event of events) {
        const result = yield* handleGitHubWebhook(
          request({
            body: JSON.stringify(event.payload),
            eventName: event.eventName,
          }),
          secret,
          () => Effect.sync(() => enqueueCount++).pipe(Effect.asVoid),
        )
        expect(result.status).toBe(202)
      }
      expect(enqueueCount).toBe(0)
    })
  })

  it.effect("rejects declared oversized bodies before enqueueing", () => {
    return Effect.gen(function* () {
      const result = yield* handleGitHubWebhook(
        request({ contentLength: String(MAX_GITHUB_WEBHOOK_BODY_BYTES + 1) }),
        secret,
        () => Effect.void,
      )
      expect(result.status).toBe(413)
    })
  })

  it.effect("does not expose unrelated routes", () => {
    return Effect.gen(function* () {
      const result = yield* handleGitHubWebhook(
        request({ path: "/api/v1/repositories/Effectful-Tech/slopcop" }),
        secret,
        () => Effect.void,
      )
      expect(result.status).toBe(404)
    })
  })

  it.effect("returns unavailable when queueing fails", () => {
    return Effect.gen(function* () {
      const result = yield* handleGitHubWebhook(request(), secret, (event) =>
        Effect.fail(new GitHubEventEnqueueError({ event, cause: "offline" })),
      )
      expect(result.status).toBe(503)
    })
  })
})
