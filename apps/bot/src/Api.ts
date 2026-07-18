import * as Layer from "effect/Layer"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar"
import { RootApi } from "@triage-bot/api/RootApi"
import { WebHooksApiHandlersLayer } from "./WebHooksApi.ts"
import { SchemaErrorLoggerLayer } from "./SchemaErrorLoggerMiddleware.ts"

export const ApiHandlersLayer = HttpApiBuilder.layer(RootApi).pipe(
  Layer.provide([WebHooksApiHandlersLayer]),
  Layer.provide(SchemaErrorLoggerLayer),
)

export const ApiDocsLayer = HttpApiScalar.layer(RootApi)
