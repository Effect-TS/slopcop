import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import {
  GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME,
  GitHubEventsQueue,
} from "@slopcop/infra/GitHubEventQueueResources"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  GitHubEventProcessors,
  isRetryableProcessorError,
} from "./GitHubEventProcessors.ts"

export const makeGitHubEventsConsumerLayerNoDeps = (options: {
  readonly queue: typeof GitHubEventsQueue
  readonly deadLetterQueueName: string
}) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const queueResource = yield* options.queue
      const processors = yield* GitHubEventProcessors
      const decodeWebhookEvent = Schema.decodeUnknownEffect(
        GitHubWebhookEvent.GitHubWebhookEvent,
      )

      const consume = Effect.fn("GitHubEvents.consume")(function* (
        event: GitHubWebhookEvent.GitHubWebhookEvent,
      ) {
        const exit = yield* Effect.exit(processors.dispatch(event))
        if (Exit.isSuccess(exit)) return
        const error = Cause.findErrorOption(exit.cause)
        if (Option.isSome(error) && !isRetryableProcessorError(error.value)) {
          yield* Effect.logWarning(
            "Retained non-retryable GitHub webhook delivery for dead-letter handling",
            {
              deliveryId: event.id,
              event: event.name,
              error: error.value,
            },
          )
        }
        return yield* Effect.failCause(exit.cause)
      })

      yield* Cloudflare.Queues.consumeQueueMessages<unknown>(
        queueResource,
        {
          batchSize: 1,
          maxConcurrency: 5,
          maxRetries: 12,
          maxWaitTime: "5 seconds",
          retryDelay: "30 seconds",
          deadLetterQueue: options.deadLetterQueueName,
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

export const GitHubEventsConsumerLayerNoDeps =
  makeGitHubEventsConsumerLayerNoDeps({
    queue: GitHubEventsQueue,
    deadLetterQueueName: GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME,
  })

export const makeGitHubEventsConsumerLayer = (
  options: Parameters<typeof makeGitHubEventsConsumerLayerNoDeps>[0],
) => makeGitHubEventsConsumerLayerNoDeps(options)

export const GitHubEventsConsumerLayer = makeGitHubEventsConsumerLayer({
  queue: GitHubEventsQueue,
  deadLetterQueueName: GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME,
})
