import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import { PullRequestFact } from "../Policy/PolicyProgram.ts"
import { lifecycleTimestamps } from "../Shared/Timestamps.ts"
import { LabelingPolicyId } from "./LabelingPolicy.ts"

export const LabelingRuleId = Schema.String.pipe(Schema.brand("LabelingRuleId"))
export const LabelOnMatch = Schema.Literal("ensure-present")
export const LabelOnNoMatch = Schema.Literals(["ensure-absent", "preserve"])
export const LabelingRuleValidationStatus = Schema.Literals([
  "valid",
  "missing",
  "unknown",
])
export const LabelingRuleConflictGroup = Schema.NullOr(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
)
export const AiEvaluator = Schema.Literal("boolean-policy-v1")
export type AiEvaluator = typeof AiEvaluator.Type
export const AiLabelingRulePrompt = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(4_000),
)
export const AiLabelingRuleEvidence = Schema.Array(PullRequestFact).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(8),
)
export const AiLabelingRuleMinimumConfidence = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }),
)

const sharedFields = {
  id: Model.UuidV7Insert(LabelingRuleId),
  repositoryId: GitHubRepositoryId,
  label: GitHubLabel.GitHubLabelName,
  onMatch: LabelOnMatch,
  onNoMatch: LabelOnNoMatch,
  conflictGroup: LabelingRuleConflictGroup,
  priority: Schema.Int,
  enabled: Model.BooleanSqlite,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromMillis),
  version: Schema.Int,
  ...lifecycleTimestamps,
} as const

export class PolicyLabelingRule extends Model.Class<PolicyLabelingRule>(
  "PolicyLabelingRule",
)({
  _tag: Schema.Literal("PolicyLabelingRule"),
  ...sharedFields,
  policyId: LabelingPolicyId,
}) {}

export class AiLabelingRule extends Model.Class<AiLabelingRule>(
  "AiLabelingRule",
)({
  _tag: Schema.Literal("AiLabelingRule"),
  ...sharedFields,
  prompt: AiLabelingRulePrompt,
  evidence: Model.JsonFromString(AiLabelingRuleEvidence),
  minimumConfidence: AiLabelingRuleMinimumConfidence,
  evaluator: AiEvaluator,
  gatePolicyId: Schema.NullOr(LabelingPolicyId),
}) {}

export const LabelingRule = Model.Union([PolicyLabelingRule, AiLabelingRule])
export type LabelingRule = typeof LabelingRule.Type
export const LabelingRuleInsert = LabelingRule.insert
export type LabelingRuleInsert = typeof LabelingRuleInsert.Type
export const LabelingRuleUpdate = LabelingRule.update
export type LabelingRuleUpdate = typeof LabelingRuleUpdate.Type
