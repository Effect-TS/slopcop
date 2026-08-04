import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  GitHubEventProcessorError,
  GitHubEventProcessors,
} from "./GitHubEventProcessors.ts"
import { GitHubSetup } from "@slopcop/github/GitHubSetup"

export const GitHubSetupProcessorLayerNoDeps = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* GitHubEventProcessors
    const setup = yield* GitHubSetup
    yield* registry.register({
      id: "github-setup",
      events: ["installation", "installation_repositories"],
      process: (event) => {
        const process =
          event.name === "installation"
            ? setup.processInstallation(event)
            : event.name === "installation_repositories"
              ? setup.processInstallationRepositories(event)
              : Effect.die("GitHub setup processor received an unrelated event")
        return process.pipe(
          Effect.mapError(
            (cause) =>
              new GitHubEventProcessorError({
                processorId: "github-setup",
                event,
                cause,
              }),
          ),
        )
      },
    })
  }),
)

export const GitHubSetupProcessorLayer = GitHubSetupProcessorLayerNoDeps.pipe(
  Layer.provide(GitHubSetup.layer),
)
