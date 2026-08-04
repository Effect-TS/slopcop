import * as Cloudflare from "alchemy/Cloudflare"
import type { WorkerProps } from "alchemy/Cloudflare"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import * as CloudflareResourceNames from "@slopcop/infra/CloudflareResourceNames"
import { GitHubEventsQueue } from "@slopcop/infra/GitHubEventQueueResources"
import { GitHubEventQueue } from "./GitHubEventQueue.ts"
import { handleGitHubWebhook } from "./GitHubIngress.ts"

export interface WebhookWorkerOptions {
  readonly resourceNames: CloudflareResourceNames.ResourceNames
  readonly queue: typeof GitHubEventsQueue
  readonly url: boolean
  readonly domain?: string
  readonly worker?: Partial<WorkerProps>
}

const WEBHOOK_RATE_LIMIT_NAMESPACE = 1001
const WEBHOOK_RATE_LIMIT_NAMESPACE_DEV = 1002
const WEBHOOK_RATE_LIMIT_PER_MINUTE = 300

export const WebhookWorker = (options: WebhookWorkerOptions) =>
  Cloudflare.Worker(
    "SlopCopWebhookIngress",
    {
      name: options.resourceNames.name("slopcop-webhook-ingress"),
      main: import.meta.url,
      compatibility: { flags: ["nodejs_compat"] },
      workersDev: options.url,
      ...(options.domain === undefined ? {} : { domain: options.domain }),
      ...options.worker,
    },
    Effect.gen(function* () {
      const events = yield* GitHubEventQueue
      const secret = yield* Config.redacted("GITHUB_WEBHOOK_SECRET")
      const rateLimit = yield* Cloudflare.RateLimit(
        "GITHUB_WEBHOOK_RATE_LIMIT",
        {
          namespaceId: options.resourceNames.rateLimitNamespace(
            WEBHOOK_RATE_LIMIT_NAMESPACE,
            WEBHOOK_RATE_LIMIT_NAMESPACE_DEV,
          ),
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
      Effect.provide(GitHubEventQueue.layerWith(options.queue)),
      Effect.provide([
        Cloudflare.Queues.WriteQueueBinding,
        Cloudflare.Workers.RateLimitBinding,
      ]),
    ),
  )

export default WebhookWorker({
  resourceNames: CloudflareResourceNames.production,
  queue: GitHubEventsQueue,
  url: true,
})
