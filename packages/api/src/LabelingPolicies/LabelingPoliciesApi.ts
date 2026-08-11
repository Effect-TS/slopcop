import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import * as Management from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import * as Rules from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { LabelingAdminMiddleware } from "../LabelingRules/Security.ts"
import {
  PullRequestNotFound,
  RepositoryNotConfigured,
} from "../LabelingRules/Errors.ts"
import {
  InvalidPolicyProgram,
  PolicyConflict,
  PolicyInUse,
  PolicyNotFound,
  PolicyTestUnavailable,
  UnsupportedTarget,
} from "./Errors.ts"
const errors = [
  RepositoryNotConfigured,
  PullRequestNotFound,
  PolicyNotFound,
  PolicyConflict,
  PolicyInUse,
  InvalidPolicyProgram,
  UnsupportedTarget,
  PolicyTestUnavailable,
]
export class LabelingPoliciesApi extends HttpApiGroup.make("labelingPolicies")
  .add(
    HttpApiEndpoint.get("listPolicies", "/policies", {
      params: Rules.RepositoryPath,
      success: Management.ListPoliciesResponse,
      error: errors,
    }),
    HttpApiEndpoint.get("getPolicy", "/policies/:policyId", {
      params: Management.PolicyPath,
      success: Management.PublicPolicyDetail,
      error: errors,
    }),
    HttpApiEndpoint.post("createPolicy", "/policies", {
      params: Rules.RepositoryPath,
      payload: Management.CreatePolicyRequest,
      success: Management.PublicPolicy.pipe(HttpApiSchema.status("Created")),
      error: errors,
    }),
    HttpApiEndpoint.patch("savePolicy", "/policies/:policyId", {
      params: Management.PolicyPath,
      payload: Management.SavePolicyRequest,
      success: Management.PublicPolicy,
      error: errors,
    }),
    HttpApiEndpoint.delete("deletePolicy", "/policies/:policyId", {
      params: Management.PolicyPath,
      query: Management.DeletePolicyQuery,
      success: HttpApiSchema.NoContent,
      error: errors,
    }),
    HttpApiEndpoint.post("validatePolicy", "/policies/:policyId/validate", {
      params: Management.PolicyPath,
      success: Management.ValidatePolicyResponse,
      error: errors,
    }),
    HttpApiEndpoint.get("listPolicyVersions", "/policies/:policyId/versions", {
      params: Management.PolicyPath,
      success: Management.ListPolicyVersionsResponse,
      error: errors,
    }),
    HttpApiEndpoint.post("testPolicy", "/policies/:policyId/test", {
      params: Management.PolicyPath,
      payload: Management.TestPolicyRequest,
      success: Management.TestPolicyResponse,
      error: errors,
    }),
  )
  .prefix("/repositories/:owner/:repo")
  .middleware(LabelingAdminMiddleware) {}
