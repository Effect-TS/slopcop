import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { GitHubEventsQueue } from "@slopcop/infra/GitHubEventQueueResources"
import { D1Database, makeDatabaseLayer } from "@slopcop/infra/Sql"
import * as CloudflareResourceNames from "@slopcop/infra/CloudflareResourceNames"
import { GitHubEventProcessors } from "./GitHub/GitHubEventProcessors.ts"
import { makeGitHubEventsConsumerLayer } from "./GitHub/GitHubEvents.ts"
import { PullRequestLabelingProcessorLayer } from "./Labeling/PullRequestLabelingProcessor.ts"
import { GitHubSetupProcessorLayer } from "./GitHub/GitHubSetupProcessor.ts"

export const makeGitHubEventsWorker = (options: {
  readonly resourceNames: CloudflareResourceNames.ResourceNames
  readonly database: typeof D1Database
  readonly queue: typeof GitHubEventsQueue
  readonly deadLetterQueueName: string
}) =>
  Cloudflare.Worker(
    "SlopCopGitHubEventProcessor",
    {
      name: options.resourceNames.name("slopcop-github-event-processor"),
      main: import.meta.url,
      workersDev: false,
      compatibility: { flags: ["nodejs_compat"] },
    },
    Effect.gen(function* () {
      const MainLayer = makeGitHubEventsConsumerLayer({
        queue: options.queue,
        deadLetterQueueName: options.deadLetterQueueName,
      }).pipe(
        Layer.provide(PullRequestLabelingProcessorLayer),
        Layer.provide(GitHubSetupProcessorLayer),
        Layer.provide(GitHubEventProcessors.layer),
        Layer.provide(makeDatabaseLayer(options.database)),
        Layer.orDie,
      )
      yield* Layer.build(MainLayer).pipe(Effect.scoped)

      return {
        fetch: Effect.succeed(HttpServerResponse.empty({ status: 404 })),
      }
    }).pipe(
      Effect.provide([
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Queues.EventSourceLive,
      ]),
    ),
  )

export default makeGitHubEventsWorker({
  resourceNames: CloudflareResourceNames.production,
  database: D1Database,
  queue: GitHubEventsQueue,
  deadLetterQueueName: CloudflareResourceNames.production.name(
    "slopcop-github-webhook-events-dead-letter",
  ),
})
