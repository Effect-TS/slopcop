import * as Setup from "@slopcop/domain/GitHub/Setup"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import { LabelingAdminMiddleware } from "../LabelingRules/Security.ts"

export class SetupApi extends HttpApiGroup.make("setup")
  .add(
    HttpApiEndpoint.get("getSetupStatus", "/setup", {
      success: Setup.SetupStatus,
    }),
    HttpApiEndpoint.post("refreshSetup", "/setup/refresh", {
      success: Setup.SetupStatus,
    }),
  )
  .middleware(LabelingAdminMiddleware) {}
