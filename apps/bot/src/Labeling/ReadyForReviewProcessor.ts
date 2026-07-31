import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  GitHubEventProcessorError,
  GitHubEventProcessors,
} from "../GitHub/GitHubEventProcessors.ts"
import { ReadyForReview } from "./ReadyForReview.ts"

const PROCESSOR_ID = "ready-for-review"

export const ReadyForReviewProcessorLayerNoDeps = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* GitHubEventProcessors
    const readyForReview = yield* ReadyForReview
    yield* registry.register({
      id: PROCESSOR_ID,
      events: [
        "pull_request",
        "pull_request_review",
        "check_suite",
        "check_run",
        "status",
      ],
      accepts: (event) =>
        event.name !== "pull_request" ||
        event.payload.action === "opened" ||
        event.payload.action === "reopened" ||
        event.payload.action === "synchronize" ||
        event.payload.action === "ready_for_review" ||
        event.payload.action === "converted_to_draft",
      process: (event) =>
        readyForReview.process(event).pipe(
          Effect.mapError(
            (cause) =>
              new GitHubEventProcessorError({
                processorId: PROCESSOR_ID,
                event,
                cause,
              }),
          ),
        ),
    })
  }),
)

export const ReadyForReviewProcessorLayer =
  ReadyForReviewProcessorLayerNoDeps.pipe(Layer.provide(ReadyForReview.layer))
