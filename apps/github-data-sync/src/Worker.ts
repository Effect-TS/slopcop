import * as GitHubDataSyncJob from "@slopcop/domain/GitHub/GitHubDataSyncJob"
import { GitHubDataSync } from "@slopcop/github/GitHubDataSync"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import * as CloudflareResourceNames from "@slopcop/infra/CloudflareResourceNames"
import { GitHubDataSyncQueue } from "@slopcop/infra/GitHubDataSyncQueueResources"
import { D1Database, makeDatabaseLayer } from "@slopcop/infra/Sql"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { makeGitHubDataSyncConsumerLayer } from "./GitHubDataSyncJobs.ts"

export const makeGitHubDataSyncWorker = (options: {
  readonly resourceNames: CloudflareResourceNames.ResourceNames
  readonly database: typeof D1Database
  readonly queue: typeof GitHubDataSyncQueue
  readonly deadLetterQueueName: string
}) =>
  Cloudflare.Worker(
    "SlopCopGitHubDataSync",
    {
      name: options.resourceNames.name("slopcop-github-data-sync"),
      main: import.meta.url,
      workersDev: false,
      compatibility: { flags: ["nodejs_compat"] },
    },
    Effect.gen(function* () {
      const MainLayer = makeGitHubDataSyncConsumerLayer({
        queue: options.queue,
        deadLetterQueueName: options.deadLetterQueueName,
      }).pipe(
        Layer.provide(GitHubDataSync.layer),
        Layer.provide(GitHubRepositoriesRepo.layer),
        Layer.provide(makeDatabaseLayer(options.database)),
        Layer.orDie,
      )
      yield* Layer.build(MainLayer).pipe(Effect.scoped)

      const queueResource = yield* options.queue
      const queue = yield* Cloudflare.Queues.WriteQueue(queueResource)
      const encode = Schema.encodeEffect(GitHubDataSyncJob.GitHubDataSyncJob)
      yield* Cloudflare.Workers.cron("*/5 * * * *", () =>
        encode({
          _tag: "SyncAllGitHubData",
          trigger: "scheduled",
          force: false,
        }).pipe(
          Effect.flatMap((body) => queue.send(body, { contentType: "json" })),
          Effect.retry({ times: 2 }),
          Effect.tapError((error) =>
            Effect.logError(
              "Could not enqueue scheduled GitHub data sync",
              error,
            ),
          ),
        ),
      )
      return {
        fetch: Effect.succeed(HttpServerResponse.empty({ status: 404 })),
      }
    }).pipe(
      Effect.provide([
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Queues.EventSourceLive,
        Cloudflare.Queues.WriteQueueBinding,
        Cloudflare.Workers.CronEventSourceLive,
      ]),
    ),
  )

export default makeGitHubDataSyncWorker({
  resourceNames: CloudflareResourceNames.production,
  database: D1Database,
  queue: GitHubDataSyncQueue,
  deadLetterQueueName: CloudflareResourceNames.production.name(
    "slopcop-github-data-sync-dead-letter",
  ),
})
