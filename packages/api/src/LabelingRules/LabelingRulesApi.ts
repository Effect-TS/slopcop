import * as Management from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import * as Errors from "./Errors.ts"
import { LabelingAdminMiddleware } from "./Security.ts"
const errors = [
  Errors.RepositoryNotConfigured,
  Errors.LabelingRuleNotFound,
  Errors.GitHubLabelNotFound,
  Errors.InvalidLabelingRule,
  Errors.DuplicateLabelingRule,
  Errors.LabelingRuleConflict,
  Errors.LabelingRulesRevisionConflict,
  Errors.GitHubLabelValidationUnavailable,
  Errors.PullRequestNotFound,
  Errors.LabelingRuleTestUnavailable,
  Errors.RuleTestCandidatesUnavailable,
]
export class LabelingRulesApi extends HttpApiGroup.make("labelingRules")
  .add(
    HttpApiEndpoint.get("listRules", "/labeling-rules", {
      params: Management.RepositoryPath,
      query: Management.ListLabelingRulesQuery,
      success: Management.ListLabelingRulesResponse,
      error: errors,
    }),
    HttpApiEndpoint.get("listRuleAudit", "/labeling-rules/audit", {
      params: Management.RepositoryPath,
      query: Management.ListLabelingRuleAuditQuery,
      success: Management.ListLabelingRuleAuditResponse,
      error: errors,
    }),
    HttpApiEndpoint.get("getRule", "/labeling-rules/:ruleId", {
      params: Management.RulePath,
      success: Management.PublicLabelingRule,
      error: errors,
    }),
    HttpApiEndpoint.get("listGitHubLabels", "/github-labels", {
      params: Management.RepositoryPath,
      success: Management.ListGitHubLabelsResponse,
      error: errors,
    }),
    HttpApiEndpoint.get(
      "listRuleTestCandidates",
      "/labeling-rules/test-candidates",
      {
        params: Management.RepositoryPath,
        query: Management.ListRuleTestCandidatesQuery,
        success: Management.ListRuleTestCandidatesResponse,
        error: errors,
      },
    ),
    HttpApiEndpoint.post(
      "validateCandidateLabel",
      "/labeling-rules/validate-label",
      {
        params: Management.RepositoryPath,
        payload: Management.ValidateCandidateLabelRequest,
        success: Management.ValidateCandidateLabelResponse,
        error: errors,
      },
    ),
    HttpApiEndpoint.post("createRule", "/labeling-rules", {
      params: Management.RepositoryPath,
      payload: Management.CreateLabelingRuleRequest,
      success: Management.PublicLabelingRule.pipe(
        HttpApiSchema.status("Created"),
      ),
      error: errors,
    }),
    HttpApiEndpoint.patch("patchRule", "/labeling-rules/:ruleId", {
      params: Management.RulePath,
      payload: Management.PatchLabelingRuleRequest,
      success: Management.PublicLabelingRule,
      error: errors,
    }),
    HttpApiEndpoint.post(
      "validateStoredRule",
      "/labeling-rules/:ruleId/validate",
      {
        params: Management.RulePath,
        success: Management.PublicLabelingRule,
        error: errors,
      },
    ),
    HttpApiEndpoint.post("testRule", "/labeling-rules/:ruleId/test", {
      params: Management.RulePath,
      payload: Management.TestLabelingRuleRequest,
      success: Management.TestLabelingRuleResponse,
      error: errors,
    }),
    HttpApiEndpoint.post("disableRule", "/labeling-rules/:ruleId/disable", {
      params: Management.RulePath,
      payload: Management.RuleVersionRequest,
      success: Management.PublicLabelingRule,
      error: errors,
    }),
    HttpApiEndpoint.delete("deleteRule", "/labeling-rules/:ruleId", {
      params: Management.RulePath,
      query: Management.RuleVersionQuery,
      success: HttpApiSchema.NoContent,
      error: errors,
    }),
  )
  .prefix("/repositories/:owner/:repo")
  .middleware(LabelingAdminMiddleware) {}
