import * as GitHubDataSyncJob from "@slopcop/domain/GitHub/GitHubDataSyncJob"
import { GitHubDataSync } from "@slopcop/github/GitHubDataSync"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { GitHubDataSyncQueue } from "@slopcop/infra/GitHubDataSyncQueueResources"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

export const makeGitHubDataSyncConsumerLayer = (options: {
  readonly queue: typeof GitHubDataSyncQueue
  readonly deadLetterQueueName: string
}) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const resource = yield* options.queue
      const sync = yield* GitHubDataSync
      const repositories = yield* GitHubRepositoriesRepo
      const decode = Schema.decodeUnknownEffect(
        GitHubDataSyncJob.GitHubDataSyncJob,
      )
      yield* Cloudflare.Queues.consumeQueueMessages<unknown>(
        resource,
        {
          batchSize: 1,
          maxConcurrency: 1,
          maxRetries: 8,
          maxWaitTime: "5 seconds",
          retryDelay: "1 minute",
          deadLetterQueue: options.deadLetterQueueName,
        },
        (stream) =>
          Stream.runForEach(stream, (message) =>
            decode(message.body).pipe(
              Effect.flatMap((job) => {
                if (job._tag === "SyncAllGitHubData") {
                  return sync.syncAll(job.force)
                }
                return repositories.findById(job.repositoryId).pipe(
                  Effect.flatMap(
                    Option.match({
                      onNone: () => Effect.void,
                      onSome: (repository) =>
                        sync.syncRepository(repository, job.force),
                    }),
                  ),
                )
              }),
              Effect.annotateLogs({
                attempts: message.attempts,
                messageId: message.id,
              }),
            ),
          ),
      )
    }),
  )
