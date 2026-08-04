import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  GitHubEventProcessorError,
  GitHubEventProcessors,
} from "../GitHub/GitHubEventProcessors.ts"
import { PullRequestLabeling } from "./PullRequestLabeling.ts"

export const PullRequestLabelingProcessorLayerNoDeps = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* GitHubEventProcessors
    const labeling = yield* PullRequestLabeling
    yield* registry.register({
      id: "pull-request-labeling",
      events: ["pull_request"],
      accepts: (event) =>
        event.name === "pull_request" &&
        (event.payload.action === "opened" ||
          event.payload.action === "reopened" ||
          event.payload.action === "synchronize" ||
          event.payload.action === "edited"),
      process: (event) =>
        event.name !== "pull_request"
          ? Effect.die(
              "Pull request processor received a non-pull-request event",
            )
          : labeling.process(event).pipe(
              Effect.mapError(
                (cause) =>
                  new GitHubEventProcessorError({
                    processorId: "pull-request-labeling",
                    event,
                    cause,
                  }),
              ),
              Effect.withSpan("PullRequestLabelingProcessor.process", {
                attributes: {
                  deliveryId: event.id,
                  action: event.payload.action,
                  pullRequest: event.payload.number,
                  githubRepositoryId: event.payload.repository.id,
                },
              }),
            ),
    })
  }),
)

export const PullRequestLabelingProcessorLayer =
  PullRequestLabelingProcessorLayerNoDeps.pipe(
    Layer.provide(PullRequestLabeling.layer),
  )
