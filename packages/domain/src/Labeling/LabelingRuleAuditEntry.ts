import { Schema } from "effect"
import { Model } from "effect/unstable/schema"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import {
  AiEvaluator,
  AiLabelingRuleEvidence,
  AiLabelingRuleMinimumConfidence,
  AiLabelingRulePrompt,
  LabelingRuleConflictGroup,
  LabelingRuleId,
  LabelingRuleValidationStatus,
  LabelOnMatch,
  LabelOnNoMatch,
} from "./LabelingRule.ts"
import { LabelingPolicyId } from "./LabelingPolicy.ts"
export const LabelingRuleAuditEntryId = Schema.String.pipe(
  Schema.brand("LabelingRuleAuditEntryId"),
)
export const LabelingRuleAuditOperation = Schema.Literals([
  "create",
  "update",
  "validate",
  "disable",
  "delete",
])
const sharedFields = {
  id: LabelingRuleId,
  repositoryId: GitHubRepositoryId,
  label: Schema.String,
  onMatch: LabelOnMatch,
  onNoMatch: LabelOnNoMatch,
  conflictGroup: LabelingRuleConflictGroup,
  priority: Schema.Int,
  enabled: Schema.Boolean,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  version: Schema.Int,
} as const
export const PolicyLabelingRuleAuditValue = Schema.Struct({
  _tag: Schema.Literal("PolicyLabelingRule"),
  ...sharedFields,
  policyId: LabelingPolicyId,
})
export const AiLabelingRuleAuditValue = Schema.Struct({
  _tag: Schema.Literal("AiLabelingRule"),
  ...sharedFields,
  prompt: AiLabelingRulePrompt,
  evidence: AiLabelingRuleEvidence,
  minimumConfidence: AiLabelingRuleMinimumConfidence,
  evaluator: AiEvaluator,
  gatePolicyId: Schema.NullOr(LabelingPolicyId),
})
// Snapshots written by the first generic policy migration had no discriminant.
export const LegacyPolicyLabelingRuleAuditValue = Schema.Struct({
  ...sharedFields,
  policyId: LabelingPolicyId,
})
export const LegacyLabelingRuleAuditValue = Schema.Struct({
  id: LabelingRuleId,
  repositoryId: GitHubRepositoryId,
  name: Schema.optionalKey(Schema.String),
  label: Schema.String,
  kind: Schema.optionalKey(Schema.String),
  instructions: Schema.optionalKey(Schema.NullOr(Schema.String)),
  confidenceThreshold: Schema.optionalKey(Schema.Finite),
  mode: Schema.optionalKey(Schema.String),
  exclusiveGroup: Schema.optionalKey(Schema.NullOr(Schema.String)),
  enabled: Schema.Boolean,
  validationStatus: Schema.String,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  version: Schema.Int,
})
export const StoredLabelingRuleAuditValue = Schema.Union([
  PolicyLabelingRuleAuditValue,
  AiLabelingRuleAuditValue,
  LegacyPolicyLabelingRuleAuditValue,
  LegacyLabelingRuleAuditValue,
])
export type StoredLabelingRuleAuditValue =
  typeof StoredLabelingRuleAuditValue.Type
export type LabelingRuleAuditValue = StoredLabelingRuleAuditValue
const Value = Model.JsonFromString(Schema.NullOr(StoredLabelingRuleAuditValue))
export class LabelingRuleAuditEntry extends Model.Class<LabelingRuleAuditEntry>(
  "LabelingRuleAuditEntry",
)({
  id: Model.UuidV7Insert(LabelingRuleAuditEntryId),
  repositoryId: Model.GeneratedByApp(GitHubRepositoryId),
  ruleId: Model.GeneratedByApp(Schema.NullOr(LabelingRuleId)),
  actor: Model.GeneratedByApp(Schema.String),
  operation: Model.GeneratedByApp(LabelingRuleAuditOperation),
  before: Value,
  after: Value,
  createdAt: Model.DateTimeInsertFromNumber,
}) {}
