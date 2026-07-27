import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import type { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

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

export class GitHubEventQueue extends Context.Service<
  GitHubEventQueue,
  {
    readonly enqueue: (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) => Effect.Effect<void, GitHubEventEnqueueError, RuntimeContext>
  }
>()("@slopcop/bot/GitHub/GitHubEventQueue", {
  make: Effect.gen(function* () {
    const queueResource = yield* GitHubEventsQueue
    const queue = yield* Cloudflare.Queues.WriteQueue(queueResource)
    const encodeWebhookEvent = Schema.encodeEffect(
      GitHubWebhookEvent.GitHubWebhookEvent,
    )

    const enqueue = Effect.fn("GitHubEventQueue.enqueue")(
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

    return { enqueue }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
