import { RootApi } from "@slopcop/api/RootApi"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import { GitHubSetup } from "@slopcop/github/GitHubSetup"
import { LabelingAdminMiddlewareLayer } from "../../Labeling/httpapi/Security.ts"

const internalFailure = (operation: string) => (error: unknown) =>
  Effect.logError(`GitHub setup ${operation} failed`, error).pipe(
    Effect.andThen(Effect.die(error)),
  )

export const SetupApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "setup",
  Effect.fnUntraced(function* (handlers) {
    const setup = yield* GitHubSetup
    return handlers.handleAll({
      getSetupStatus: () =>
        setup.getStatus().pipe(Effect.catch(internalFailure("status lookup"))),
      refreshSetup: () =>
        setup.refresh().pipe(Effect.catch(internalFailure("refresh"))),
    })
  }),
).pipe(Layer.provide(LabelingAdminMiddlewareLayer))
