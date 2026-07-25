import * as Layer from "effect/Layer"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar"
import { RootApi } from "@slopcop/api/RootApi"
import { LabelingRulesApiHandlersLayer } from "./Labeling/httpapi/Handlers.ts"
import { WebhooksApiHandlersLayer } from "./Webhooks/httpapi/GitHub.ts"
import { SchemaErrorLoggerLayer } from "./Shared/SchemaErrorLogger.ts"

export const ApiHandlersLayer = HttpApiBuilder.layer(RootApi).pipe(
  Layer.provide([LabelingRulesApiHandlersLayer, WebhooksApiHandlersLayer]),
  Layer.provide(SchemaErrorLoggerLayer),
)

export const ApiDocsLayer = HttpApiScalar.layer(RootApi)
