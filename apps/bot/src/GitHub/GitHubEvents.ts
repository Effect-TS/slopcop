import * as GitHubEvent from "@slopcop/domain/GitHub/GitHubEvent"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME,
  GitHubEventsQueue,
} from "./GitHubEventQueue.ts"
import { GitHubEventProcessors } from "./GitHubEventProcessors.ts"
import { GitHubEventsRepo } from "./repositories/GitHubEventsRepo.ts"

export class GitHubEventProcessingError extends Data.TaggedError(
  "GitHubEventProcessingError",
)<{
  readonly reason: "DeliveryBusy" | "ProcessingFailed"
  readonly event: GitHubWebhookEvent.GitHubWebhookEvent
  readonly message: string
}> {}

export const GitHubEventsConsumerLayerNoDeps = Layer.effectDiscard(
  Effect.gen(function* () {
    const queueResource = yield* GitHubEventsQueue
    const repo = yield* GitHubEventsRepo
    const processors = yield* GitHubEventProcessors
    const decodeWebhookEvent = Schema.decodeUnknownEffect(
      GitHubWebhookEvent.GitHubWebhookEvent,
    )
    const decodeEventId = Schema.decodeUnknownEffect(GitHubEvent.GitHubEventId)

    const consume = Effect.fn("GitHubEvents.consume")(function* (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) {
      const id = yield* decodeEventId(event.id)
      const claim = yield* repo.claim(
        GitHubEvent.GitHubEvent.insert.make({ id, name: event.name }),
      )

      switch (claim._tag) {
        case "Completed":
          return yield* Effect.annotateLogs(
            Effect.logInfo("Skipped completed GitHub webhook delivery"),
            { deliveryId: id, event: event.name },
          )
        case "Busy":
          return yield* new GitHubEventProcessingError({
            event,
            reason: "DeliveryBusy",
            message: "The GitHub webhook delivery is already being processed",
          })
        case "Claimed": {
          const exit = yield* Effect.exit(processors.dispatch(event))
          if (Exit.isSuccess(exit)) {
            return yield* Effect.asVoid(repo.markCompleted(claim.event.id))
          }
          yield* repo.releaseClaim(claim.event.id, Cause.pretty(exit.cause))
          return yield* Effect.failCause(exit.cause)
        }
      }
    })

    yield* Cloudflare.Queues.consumeQueueMessages<unknown>(
      queueResource,
      {
        batchSize: 1,
        maxConcurrency: 5,
        maxRetries: 12,
        maxWaitTime: "5 seconds",
        retryDelay: "30 seconds",
        deadLetterQueue: GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME,
      },
      (stream) =>
        Stream.runForEach(
          stream,
          Effect.fnUntraced(function* (message) {
            const event = yield* decodeWebhookEvent(message.body)
            yield* Effect.annotateLogs(consume(event), {
              attempts: message.attempts,
              messageId: message.id,
            })
          }),
        ),
    )
  }),
)

export const GitHubEventsConsumerLayer = GitHubEventsConsumerLayerNoDeps.pipe(
  Layer.provide(GitHubEventsRepo.layer),
)
