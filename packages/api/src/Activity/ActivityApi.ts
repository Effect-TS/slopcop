import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import { LabelingAdminMiddleware } from "../LabelingRules/Security.ts"

export class ActivityApi extends HttpApiGroup.make("activity")
  .add(
    HttpApiEndpoint.get("listLabelingRuleActivity", "/labeling-rules", {
      query: LabelingRuleManagement.ListLabelingRuleActivityQuery,
      success: LabelingRuleManagement.ListLabelingRuleActivityResponse,
    }),
  )
  .prefix("/activity")
  .middleware(LabelingAdminMiddleware) {}
