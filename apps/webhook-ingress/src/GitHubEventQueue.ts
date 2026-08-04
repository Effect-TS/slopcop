import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import { GitHubEventsQueue } from "@slopcop/infra/GitHubEventQueueResources"
import type { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export class GitHubEventEnqueueError extends Data.TaggedError(
  "GitHubEventQueueError",
)<{
  readonly event: GitHubWebhookEvent.GitHubWebhookEvent
  readonly cause: unknown
}> {}

const makeGitHubEventQueue = (queueResourceEffect: typeof GitHubEventsQueue) =>
  Effect.gen(function* () {
    const queueResource = yield* queueResourceEffect
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
  })

export class GitHubEventQueue extends Context.Service<
  GitHubEventQueue,
  {
    readonly enqueue: (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) => Effect.Effect<void, GitHubEventEnqueueError, RuntimeContext>
  }
>()("@slopcop/webhook-ingress/GitHubEventQueue", {
  make: makeGitHubEventQueue(GitHubEventsQueue),
}) {
  static readonly makeWith = (queueResourceEffect: typeof GitHubEventsQueue) =>
    makeGitHubEventQueue(queueResourceEffect)

  static readonly layerWith = (queueResourceEffect: typeof GitHubEventsQueue) =>
    Layer.effect(GitHubEventQueue, makeGitHubEventQueue(queueResourceEffect))

  static readonly layer = Layer.effect(GitHubEventQueue, this.make)
}
