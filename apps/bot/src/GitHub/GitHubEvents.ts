import { GitHubWebhookEvent } from "@slopcop/domain/GitHubWebhookEvent"
import type { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { GitHubWebhookQueueMessage } from "./GitHubWebhookQueueMessage.ts"
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
  readonly event: GitHubWebhookEvent
  readonly cause: unknown
}> {}

export class GitHubEventProcessingError extends Data.TaggedError(
  "GitHubEventProcessingError",
)<{
  readonly reason: "DeliveryBusy" | "ProcessingFailed"
  readonly event: GitHubWebhookEvent
  readonly message: string
}> {}

export class GitHubEvents extends Context.Service<
  GitHubEvents,
  {
    readonly enqueue: (
      event: GitHubWebhookEvent,
    ) => Effect.Effect<void, GitHubEventEnqueueError, RuntimeContext>
  }
>()("@slopcop/bot/GitHub/GitHubEvents", {
  make: Effect.gen(function* () {
    const queueResource = yield* GitHubEventsQueue
    const queue = yield* Cloudflare.Queues.WriteQueue(queueResource)
    const repo = yield* GitHubEventsRepo
    const encodeWebhookEvent = Schema.encodeEffect(GitHubWebhookEvent)

    const enqueue = Effect.fn("GitHubEvents.enqueue")(
      function* (event: GitHubWebhookEvent) {
        const body = encodeWebhookEvent(event)
        return yield* queue.send(body, { contentType: "json" })
      },
      (effect, event) =>
        Effect.mapError(
          effect,
          (cause) => new GitHubEventEnqueueError({ event, cause }),
        ),
    )

    const process = Effect.fn("GitHubEvents.process")(function* (
      event: GitHubWebhookEvent,
    ): Effect.fn.Return<void, GitHubEventProcessingError> {
      // Stub processor for now
      yield* Effect.logInfo("Processed GitHub webhook event").pipe(
        Effect.annotateLogs({
          deliveryId: event.id,
          event: event.name,
        }),
      )
    })

    const consume = Effect.fn("GitHubEvents.consume")(function* (
      event: GitHubWebhookEvent,
    ) {
      const claim = yield* repo.claim(event)

      if (claim._tag === "Completed") {
        return yield* Effect.annotateLogs(
          Effect.logInfo("Skipped completed GitHub webhook delivery"),
          { deliveryId: event.id },
        )
      }

      if (claim._tag === "Busy") {
        return yield* new GitHubEventProcessingError({
          event,
          reason: "DeliveryBusy",
          message: "The GitHub webhook delivery is already being processed",
        })
      }

      return yield* process(event).pipe(
        Effect.catch((error) => repo.release(error.event.id, error.message)),
        Effect.andThen(repo.complete(event.id)),
      )
    })

    const decodeQueueMessage = Schema.decodeUnknownEffect(
      GitHubWebhookQueueMessage.schema,
    )
    const decodeWebhookEvent = Schema.decodeUnknownEffect(GitHubWebhookEvent)
    yield* Cloudflare.Queues.consumeQueueMessages<unknown>(
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
            const envelope = GitHubWebhookQueueMessage.normalize(
              yield* decodeQueueMessage(message.body),
            )

            if (!GitHubWebhookQueueMessage.isSupported(envelope.name)) {
              return yield* Effect.annotateLogs(
                Effect.logInfo(
                  "Ignored unsupported queued GitHub webhook event",
                ),
                {
                  id: envelope.id,
                  event: envelope.name,
                  messageId: message.id,
                },
              )
            }

            const event = yield* decodeWebhookEvent(envelope)
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
