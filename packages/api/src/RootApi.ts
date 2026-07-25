import * as HttpApi from "effect/unstable/httpapi/HttpApi"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as OpenApi from "effect/unstable/httpapi/OpenApi"
import { LabelingRulesApi } from "./LabelingRules/LabelingRulesApi.ts"
import { WebhooksApi } from "./Webhooks/WebhooksApi.ts"

export class SchemaErrorLogger extends HttpApiMiddleware.Service<SchemaErrorLogger>()(
  "@platform/domain/RootApi/SchemaErrorLogger",
) {}

export class RootApi extends HttpApi.make("RootApi")
  .add(WebhooksApi)
  .add(LabelingRulesApi)
  .prefix("/api/v1")
  .annotate(OpenApi.Servers, [{ url: "/api" }])
  .middleware(SchemaErrorLogger) {}
