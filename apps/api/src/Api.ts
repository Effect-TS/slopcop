import * as Layer from "effect/Layer"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar"
import { RootApi } from "@slopcop/api/RootApi"
import { LabelingRulesApiHandlersLayer } from "./Labeling/httpapi/Handlers.ts"
import { RepositoriesApiHandlersLayer } from "./GitHub/httpapi/Handlers.ts"
import { SchemaErrorLoggerLayer } from "./Shared/SchemaErrorLogger.ts"
import { SetupApiHandlersLayer } from "./GitHub/httpapi/SetupHandlers.ts"
import { LabelingPoliciesApiHandlersLayer } from "./Labeling/httpapi/PolicyHandlers.ts"
import { ActivityApiHandlersLayer } from "./Activity/httpapi/Handlers.ts"

export const ApiHandlersLayer = HttpApiBuilder.layer(RootApi).pipe(
  Layer.provide(ActivityApiHandlersLayer),
  Layer.provide(RepositoriesApiHandlersLayer),
  Layer.provide(SetupApiHandlersLayer),
  Layer.provide(LabelingRulesApiHandlersLayer),
  Layer.provide(LabelingPoliciesApiHandlersLayer),
  Layer.provide(SchemaErrorLoggerLayer),
)

export const ApiDocsLayer = HttpApiScalar.layer(RootApi)
