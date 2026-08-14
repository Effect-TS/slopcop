import * as GitHubDataSyncJob from "@slopcop/domain/GitHub/GitHubDataSyncJob"
import { GitHubDataSyncQueue as QueueResource } from "@slopcop/infra/GitHubDataSyncQueueResources"
import type { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export class GitHubDataSyncEnqueueError extends Data.TaggedError(
  "GitHubDataSyncEnqueueError",
)<{ readonly cause: unknown }> {}

const make = (resourceEffect: typeof QueueResource) =>
  Effect.gen(function* () {
    const resource = yield* resourceEffect
    const queue = yield* Cloudflare.Queues.WriteQueue(resource)
    const encode = Schema.encodeEffect(GitHubDataSyncJob.GitHubDataSyncJob)
    return {
      enqueue: (job: GitHubDataSyncJob.GitHubDataSyncJob) =>
        encode(job).pipe(
          Effect.flatMap((body) => queue.send(body, { contentType: "json" })),
          Effect.mapError((cause) => new GitHubDataSyncEnqueueError({ cause })),
        ),
    }
  })

export class GitHubDataSyncQueue extends Context.Service<
  GitHubDataSyncQueue,
  {
    readonly enqueue: (
      job: GitHubDataSyncJob.GitHubDataSyncJob,
    ) => Effect.Effect<void, GitHubDataSyncEnqueueError, RuntimeContext>
  }
>()("@slopcop/api/GitHubDataSyncQueue", { make: make(QueueResource) }) {
  static readonly layerWith = (resource: typeof QueueResource) =>
    Layer.effect(this, make(resource))
}
