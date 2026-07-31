import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { GitHubEventProcessors } from "./GitHub/GitHubEventProcessors.ts"
import { GitHubEventsConsumerLayer } from "./GitHub/GitHubEvents.ts"
import { PullRequestLabelingProcessorLayer } from "./Labeling/PullRequestLabelingProcessor.ts"
import { ReadyForReviewProcessorLayer } from "./Labeling/ReadyForReviewProcessor.ts"
import { DatabaseLayer } from "./Sql.ts"

export default Cloudflare.Worker(
  "SlopCopGitHubEventProcessor",
  {
    name: "slopcop-github-event-processor",
    main: import.meta.url,
    url: false,
    compatibility: { flags: ["nodejs_compat"] },
  },
  Effect.gen(function* () {
    const MainLayer = GitHubEventsConsumerLayer.pipe(
      Layer.provide([
        PullRequestLabelingProcessorLayer,
        ReadyForReviewProcessorLayer,
      ]),
      Layer.provide(GitHubEventProcessors.layer),
      Layer.provide(DatabaseLayer),
      Layer.orDie,
    )
    yield* Layer.build(MainLayer).pipe(Effect.scoped)

    return { fetch: Effect.succeed(HttpServerResponse.empty({ status: 404 })) }
  }).pipe(
    Effect.provide([
      Cloudflare.D1.QueryDatabaseBinding,
      Cloudflare.Queues.EventSourceLive,
    ]),
  ),
)
