import { RootApi } from "@triage-bot/api/RootApi"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import { GitHubWebHookMiddlewareLayer } from "./GitHubWebHookMiddleware.ts"

export const WebHooksApiHandlersLayerNoDeps = HttpApiBuilder.group(
  RootApi,
  "webhooks",
  (handlers) =>
    handlers.handle("github", ({ headers }) =>
      Effect.logInfo("Accepted GitHub webhook").pipe(
        Effect.annotateLogs({
          deliveryId: headers["x-github-delivery"],
          event: headers["x-github-event"],
        }),
        Effect.asVoid,
      ),
    ),
)

export const WebHooksApiHandlersLayer = WebHooksApiHandlersLayerNoDeps.pipe(
  Layer.provide(GitHubWebHookMiddlewareLayer),
)
