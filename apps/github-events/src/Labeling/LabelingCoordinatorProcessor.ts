import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  GitHubEventProcessorError,
  GitHubEventProcessors,
} from "../GitHub/GitHubEventProcessors.ts"
import {
  LabelingCoordinator,
  LabelingCoordinatorLayer,
} from "./LabelingCoordinator.ts"

const PROCESSOR_ID = "labeling-coordinator"
export const LabelingCoordinatorProcessorLayerNoDeps = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* GitHubEventProcessors
    const coordinator = yield* LabelingCoordinator
    yield* registry.register({
      id: PROCESSOR_ID,
      events: [
        "pull_request",
        "pull_request_review",
        "check_suite",
        "check_run",
        "status",
      ],
      accepts: () => true,
      process: (event) =>
        coordinator.process(event).pipe(
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
export const LabelingCoordinatorProcessorLayer =
  LabelingCoordinatorProcessorLayerNoDeps.pipe(
    Layer.provide(LabelingCoordinatorLayer),
  )
