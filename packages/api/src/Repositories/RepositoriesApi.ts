import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import { LabelingAdminMiddleware } from "../LabelingRules/Security.ts"
import { RepositoryNotFound } from "./Errors.ts"

export class RepositoriesApi extends HttpApiGroup.make("repositories")
  .add(
    HttpApiEndpoint.get("listRepositories", "/repositories", {
      success: RepositoryManagement.ListRepositoriesResponse,
    }),
    HttpApiEndpoint.patch(
      "updateRepositoryEnabled",
      "/repositories/:owner/:repo/enabled",
      {
        params: RepositoryManagement.RepositoryPath,
        payload: RepositoryManagement.UpdateRepositoryEnabledRequest,
        success: RepositoryManagement.RepositorySummary,
        error: RepositoryNotFound,
      },
    ),
  )
  .middleware(LabelingAdminMiddleware) {}
