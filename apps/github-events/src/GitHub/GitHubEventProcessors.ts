import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export class DuplicateGitHubEventProcessor extends Data.TaggedError(
  "DuplicateGitHubEventProcessor",
)<{ readonly processorId: string }> {}

export interface GitHubEventProcessor {
  readonly id: string
  readonly events: ReadonlyArray<GitHubWebhookEvent.GitHubWebhookEventName>
  readonly accepts?: (event: GitHubWebhookEvent.GitHubWebhookEvent) => boolean
  readonly process: (
    event: GitHubWebhookEvent.GitHubWebhookEvent,
  ) => Effect.Effect<void, GitHubEventProcessorError>
}

export class GitHubEventProcessorError extends Data.TaggedError(
  "GitHubEventProcessorError",
)<{
  readonly processorId: string
  readonly event: GitHubWebhookEvent.GitHubWebhookEvent
  readonly cause: unknown
}> {}

export class GitHubEventProcessors extends Context.Service<
  GitHubEventProcessors,
  {
    readonly register: (
      processor: GitHubEventProcessor,
    ) => Effect.Effect<void, DuplicateGitHubEventProcessor>
    readonly dispatch: (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) => Effect.Effect<void, GitHubEventProcessorError>
  }
>()("@slopcop/github-events/GitHubEventProcessorRegistry", {
  make: Effect.sync(() => {
    const processors = new Map<string, GitHubEventProcessor>()

    const register = Effect.fn("GitHubEventProcessorRegistry.register")(
      function* (processor: GitHubEventProcessor) {
        if (processors.has(processor.id)) {
          return yield* new DuplicateGitHubEventProcessor({
            processorId: processor.id,
          })
        }

        processors.set(processor.id, processor)
      },
    )

    const dispatch = Effect.fn("GitHubEventProcessorRegistry.dispatch")(
      function* (event: GitHubWebhookEvent.GitHubWebhookEvent) {
        const matching: Array<GitHubEventProcessor> = []

        for (const processor of processors.values()) {
          const hasEvent = processor.events.some((name) => name === event.name)
          const acceptsEvent = hasEvent && (processor.accepts?.(event) ?? true)
          if (hasEvent && acceptsEvent) {
            matching.push(processor)
          }
        }

        if (matching.length === 0) {
          return yield* Effect.annotateLogs(
            Effect.logInfo("No processors registered for GitHub event"),
            { eventId: event.id, eventName: event.name },
          )
        }

        const processEvent = matching.map((processor) =>
          processor.process(event).pipe(
            Effect.annotateLogs({
              deliveryId: event.id,
              event: event.name,
              processor: processor.id,
            }),
          ),
        )

        yield* Effect.all(processEvent, {
          concurrency: matching.length,
          discard: true,
        })
      },
    )

    return {
      register,
      dispatch,
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
