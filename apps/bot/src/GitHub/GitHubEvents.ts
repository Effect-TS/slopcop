import * as GitHubEvent from "@slopcop/domain/GitHub/GitHubEvent"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import type { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { GitHubEventProcessors } from "./GitHubEventProcessors.ts"
import { GitHubEventsRepo } from "./repositories/GitHubEventsRepo.ts"

export const GitHubEventsQueue = Cloudflare.Queues.Queue("GitHubEventsQueue", {
  name: "slopcop-github-webhook-events",
})

export const GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME =
  "slopcop-github-webhook-events-dead-letter"
export const GitHubEventsDeadLetterQueue = Cloudflare.Queues.Queue(
  "GitHubEventsDeadLetterQueue",
  { name: GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME },
)

export class GitHubEventEnqueueError extends Data.TaggedError(
  "GitHubEventQueueError",
)<{
  readonly event: GitHubWebhookEvent.GitHubWebhookEvent
  readonly cause: unknown
}> {}

export class GitHubEventProcessingError extends Data.TaggedError(
  "GitHubEventProcessingError",
)<{
  readonly reason: "DeliveryBusy" | "ProcessingFailed"
  readonly event: GitHubWebhookEvent.GitHubWebhookEvent
  readonly message: string
}> {}

export class GitHubEvents extends Context.Service<
  GitHubEvents,
  {
    readonly enqueue: (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) => Effect.Effect<void, GitHubEventEnqueueError, RuntimeContext>
  }
>()("@slopcop/bot/GitHub/GitHubEvents", {
  make: Effect.gen(function* () {
    const queueResource = yield* GitHubEventsQueue
    yield* GitHubEventsDeadLetterQueue

    const queue = yield* Cloudflare.Queues.WriteQueue(queueResource)
    const repo = yield* GitHubEventsRepo
    const processors = yield* GitHubEventProcessors

    const encodeWebhookEvent = Schema.encodeEffect(
      GitHubWebhookEvent.GitHubWebhookEvent,
    )
    const decodeWebhookEvent = Schema.decodeUnknownEffect(
      GitHubWebhookEvent.GitHubWebhookEvent,
    )
    const decodeEventId = Schema.decodeUnknownEffect(GitHubEvent.GitHubEventId)

    const enqueue = Effect.fn("GitHubEvents.enqueue")(
      function* (event: GitHubWebhookEvent.GitHubWebhookEvent) {
        const body = yield* encodeWebhookEvent(event)
        return yield* queue.send(body, { contentType: "json" })
      },
      (effect, event) =>
        Effect.mapError(
          effect,
          (cause) => new GitHubEventEnqueueError({ event, cause }),
        ),
    )

    const consume = Effect.fn("GitHubEvents.consume")(function* (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) {
      const id = yield* decodeEventId(event.id)

      const claim = yield* repo.claim(
        GitHubEvent.GitHubEvent.insert.make({
          id,
          name: event.name,
        }),
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

    return {
      enqueue,
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(GitHubEventsRepo.layer),
  )
}
