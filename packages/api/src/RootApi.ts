import * as HttpApi from "effect/unstable/httpapi/HttpApi"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as OpenApi from "effect/unstable/httpapi/OpenApi"
import { LabelingRulesApi } from "./LabelingRules/LabelingRulesApi.ts"
import { RepositoriesApi } from "./Repositories/RepositoriesApi.ts"
import { SetupApi } from "./Setup/SetupApi.ts"
import { LabelingPoliciesApi } from "./LabelingPolicies/LabelingPoliciesApi.ts"
import { ActivityApi } from "./Activity/ActivityApi.ts"

export class SchemaErrorLogger extends HttpApiMiddleware.Service<SchemaErrorLogger>()(
  "@platform/domain/RootApi/SchemaErrorLogger",
) {}

export class RootApi extends HttpApi.make("RootApi")
  .add(ActivityApi)
  .add(RepositoriesApi)
  .add(SetupApi)
  .add(LabelingRulesApi)
  .add(LabelingPoliciesApi)
  .prefix("/api/v1")
  .annotate(OpenApi.Servers, [{ url: "/api" }])
  .middleware(SchemaErrorLogger) {}
