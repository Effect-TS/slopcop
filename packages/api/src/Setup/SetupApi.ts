import * as Setup from "@slopcop/domain/GitHub/Setup"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
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
  .add(
    HttpApiEndpoint.get("getGitHubDataSyncStatus", "/github-data/sync", {
      success: Setup.GitHubDataSyncStatus,
    }),
    HttpApiEndpoint.post("refreshGitHubData", "/github-data/sync", {
      success: Setup.GitHubDataSyncAccepted.pipe(
        HttpApiSchema.status("Accepted"),
      ),
    }),
  )
  .middleware(LabelingAdminMiddleware) {}
