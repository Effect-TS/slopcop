import { GitHubWebHookEvent } from "@triage-bot/domain/GitHubWebhookEvent"
import type { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { GitHubEventsRepo } from "./repositories/GitHubEventsRepo.ts"
import * as Schema from "effect/Schema"

export const GitHubEventsQueue = Cloudflare.Queues.Queue("GitHubEventsQueue", {
  name: "slopcop-github-webhook-events",
})

const GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME =
  "slopcop-github-webhook-events-dead-letter"
export const GitHubEventsDeadLetterQueue = Cloudflare.Queues.Queue(
  "GitHubEventsDeadLetterQueue",
  {
    name: GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME,
  },
)

export class GitHubEventEnqueueError extends Data.TaggedError(
  "GitHubEventQueueError",
)<{
  readonly deliveryId: string
  readonly cause: unknown
}> {}

export class GitHubEventProcessingError extends Data.TaggedError(
  "GitHubEventProcessingError",
)<{
  readonly deliveryId: string
  readonly reason: "DeliveryBusy" | "ProcessingFailed"
  readonly message: string
}> {}

export class GitHubEvents extends Context.Service<
  GitHubEvents,
  {
    readonly enqueue: (
      event: GitHubWebHookEvent,
    ) => Effect.Effect<void, GitHubEventEnqueueError, RuntimeContext>
  }
>()("@triage-bot/bot/GitHub/GitHubEvents", {
  make: Effect.gen(function* () {
    const queueResource = yield* GitHubEventsQueue
    const queue = yield* Cloudflare.Queues.WriteQueue(queueResource)
    const repo = yield* GitHubEventsRepo

    const enqueue = Effect.fn("GitHubEvents.enqueue")(function* (
      event: GitHubWebHookEvent,
    ) {
      yield* queue.send(event, { contentType: "json" }).pipe(
        Effect.mapError(
          (cause) =>
            new GitHubEventEnqueueError({
              deliveryId: event.deliveryId,
              cause,
            }),
        ),
      )
    })

    const process = Effect.fn("GitHubEvents.process")(function* (
      event: GitHubWebHookEvent,
    ): Effect.fn.Return<void, GitHubEventProcessingError> {
      // Stub processor for now
      yield* Effect.logInfo("Processed GitHub webhook event").pipe(
        Effect.annotateLogs({
          deliveryId: event.deliveryId,
          event: event.eventName,
        }),
      )
    })

    const consume = Effect.fn("GitHubEvents.consume")(function* (
      event: GitHubWebHookEvent,
    ) {
      const claim = yield* repo.claim(event)

      if (claim._tag === "Completed") {
        return yield* Effect.annotateLogs(
          Effect.logInfo("Skipped completed GitHub webhook delivery"),
          { deliveryId: event.deliveryId },
        )
      }

      if (claim._tag === "Busy") {
        return yield* new GitHubEventProcessingError({
          deliveryId: event.deliveryId,
          reason: "DeliveryBusy",
          message: "The GitHub webhook delivery is already being processed",
        })
      }

      return yield* process(event).pipe(
        Effect.catch((error) => repo.release(error.deliveryId, error.message)),
        Effect.andThen(repo.complete(event.deliveryId)),
      )
    })

    const decodeWebHookMessage = Schema.decodeUnknownEffect(GitHubWebHookEvent)
    yield* Cloudflare.Queues.consumeQueueMessages(
      queueResource,
      {
        batchSize: 1,
        maxConcurrency: 5,
        maxRetries: 3,
        maxWaitTime: "5 seconds",
        retryDelay: "30 seconds",
        deadLetterQueue: GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME,
      },
      (stream) =>
        Stream.runForEach(
          stream,
          Effect.fnUntraced(function* (message) {
            const event = yield* decodeWebHookMessage(message)
            yield* Effect.annotateLogs(consume(event), {
              attempts: message.attempts,
              messageId: message.id,
            })
          }),
        ),
    )

    return { enqueue }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(GitHubEventsRepo.layer),
  )
}
