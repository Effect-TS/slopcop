import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import {
  DuplicateLabelingRule,
  GitHubLabelNotFound,
  GitHubLabelValidationUnavailable,
  InvalidLabelingRule,
  LabelingRuleConflict,
  LabelingRuleNotFound,
  LabelingRulesRevisionConflict,
  RepositoryNotConfigured,
} from "./Errors.ts"
import { LabelingAdminMiddleware } from "./Security.ts"

const allErrors = [
  RepositoryNotConfigured,
  LabelingRuleNotFound,
  GitHubLabelNotFound,
  InvalidLabelingRule,
  DuplicateLabelingRule,
  LabelingRuleConflict,
  LabelingRulesRevisionConflict,
  GitHubLabelValidationUnavailable,
]

export class LabelingRulesApi extends HttpApiGroup.make("labelingRules")
  .add(
    HttpApiEndpoint.get("listRules", "/labeling-rules", {
      params: LabelingRuleManagement.RepositoryPath,
      query: LabelingRuleManagement.ListLabelingRulesQuery,
      success: LabelingRuleManagement.ListLabelingRulesResponse,
      error: allErrors,
    }),
    HttpApiEndpoint.get("getRule", "/labeling-rules/:ruleId", {
      params: LabelingRuleManagement.RulePath,
      success: LabelingRuleManagement.PublicLabelingRule,
      error: allErrors,
    }),
    HttpApiEndpoint.get("listGitHubLabels", "/github-labels", {
      params: LabelingRuleManagement.RepositoryPath,
      success: LabelingRuleManagement.ListGitHubLabelsResponse,
      error: allErrors,
    }),
    HttpApiEndpoint.post(
      "validateCandidateLabel",
      "/labeling-rules/validate-label",
      {
        params: LabelingRuleManagement.RepositoryPath,
        payload: LabelingRuleManagement.ValidateCandidateLabelRequest,
        success: LabelingRuleManagement.ValidateCandidateLabelResponse,
        error: allErrors,
      },
    ),
    HttpApiEndpoint.post("createRule", "/labeling-rules", {
      params: LabelingRuleManagement.RepositoryPath,
      payload: LabelingRuleManagement.CreateLabelingRuleRequest,
      success: LabelingRuleManagement.PublicLabelingRule.pipe(
        HttpApiSchema.status("Created"),
      ),
      error: allErrors,
    }),
    HttpApiEndpoint.patch("patchRule", "/labeling-rules/:ruleId", {
      params: LabelingRuleManagement.RulePath,
      payload: LabelingRuleManagement.PatchLabelingRuleRequest,
      success: LabelingRuleManagement.PublicLabelingRule,
      error: allErrors,
    }),
    HttpApiEndpoint.post(
      "validateStoredRule",
      "/labeling-rules/:ruleId/validate",
      {
        params: LabelingRuleManagement.RulePath,
        success: LabelingRuleManagement.PublicLabelingRule,
        error: allErrors,
      },
    ),
    HttpApiEndpoint.post("disableRule", "/labeling-rules/:ruleId/disable", {
      params: LabelingRuleManagement.RulePath,
      payload: LabelingRuleManagement.RuleVersionRequest,
      success: LabelingRuleManagement.PublicLabelingRule,
      error: allErrors,
    }),
    HttpApiEndpoint.delete("deleteRule", "/labeling-rules/:ruleId", {
      params: LabelingRuleManagement.RulePath,
      query: LabelingRuleManagement.RuleVersionQuery,
      success: HttpApiSchema.NoContent,
      error: allErrors,
    }),
  )
  .prefix("/repositories/:owner/:repo")
  .middleware(LabelingAdminMiddleware) {}
