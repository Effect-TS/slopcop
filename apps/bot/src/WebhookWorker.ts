import * as Cloudflare from "alchemy/Cloudflare"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { GitHubEventQueue } from "./GitHub/GitHubEventQueue.ts"
import { handleGitHubWebhook } from "./Webhooks/GitHubIngress.ts"

export interface WebhookWorkerOptions {
  readonly url: boolean
  readonly domain?: string
}

const WEBHOOK_RATE_LIMIT_NAMESPACE = 1001
const WEBHOOK_RATE_LIMIT_PER_MINUTE = 300

export const WebhookWorker = (options: WebhookWorkerOptions) =>
  Cloudflare.Worker(
    "SlopCopWebhookIngress",
    {
      name: "slopcop-webhook-ingress",
      main: import.meta.url,
      compatibility: { flags: ["nodejs_compat"] },
      ...options,
    },
    Effect.gen(function* () {
      const events = yield* GitHubEventQueue
      const secret = yield* Config.redacted("GITHUB_WEBHOOK_SECRET")
      const rateLimit = yield* Cloudflare.RateLimit(
        "GITHUB_WEBHOOK_RATE_LIMIT",
        {
          namespaceId: WEBHOOK_RATE_LIMIT_NAMESPACE,
          simple: { limit: WEBHOOK_RATE_LIMIT_PER_MINUTE, period: 60 },
        },
      )

      return {
        fetch: Effect.gen(function* () {
          const request = yield* Cloudflare.Workers.Request
          const rateLimitResult = yield* rateLimit
            .limit({
              key: request.headers.get("cf-connecting-ip") ?? "unknown",
            })
            .pipe(Effect.option)
          if (
            rateLimitResult._tag === "None" ||
            !rateLimitResult.value.success
          ) {
            return HttpServerResponse.text("Too Many Requests", { status: 429 })
          }
          return yield* handleGitHubWebhook(request, secret, events.enqueue)
        }),
      }
    }).pipe(
      Effect.provide(GitHubEventQueue.layer),
      Effect.provide([
        Cloudflare.Queues.WriteQueueBinding,
        Cloudflare.Workers.RateLimitBinding,
      ]),
    ),
  )

export default WebhookWorker({ url: true })
