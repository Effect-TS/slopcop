import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import { GitHubWebhookDeliveryId } from "../GitHub/GitHubWebhookDelivery.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import {
  PolicyNodeTrace,
  PolicyEvaluationOutcome,
  PolicyTarget,
  PolicyVersionId,
} from "../Policy/PolicyProgram.ts"
import { LabelingPolicyId } from "./LabelingPolicy.ts"
import { AiEvaluator, LabelingRuleId } from "./LabelingRule.ts"

export const PolicyEvaluationId = Schema.String.pipe(
  Schema.brand("PolicyEvaluationId"),
)
export const PolicyEvaluationTrace = Schema.Array(PolicyNodeTrace)
const sharedEvaluationFields = {
  id: Model.UuidV7Insert(PolicyEvaluationId),
  deliveryId: GitHubWebhookDeliveryId,
  repositoryId: GitHubRepositoryId,
  ruleId: LabelingRuleId,
  ruleVersion: Schema.Int,
  target: PolicyTarget,
  subjectNumber: Schema.Int,
  headSha: Schema.NullOr(Schema.String),
  automationRevision: Schema.Int,
  outcome: PolicyEvaluationOutcome,
  confidence: Schema.Number,
  rationale: Schema.String,
  createdAt: Model.DateTimeInsertFromNumber,
} as const

export class PolicyRuleEvaluation extends Model.Class<PolicyRuleEvaluation>(
  "PolicyRuleEvaluation",
)({
  _tag: Schema.Literal("PolicyRuleEvaluation"),
  ...sharedEvaluationFields,
  policyId: LabelingPolicyId,
  policyVersionId: PolicyVersionId,
  trace: Model.JsonFromString(PolicyEvaluationTrace),
}) {}

export class AiRuleEvaluation extends Model.Class<AiRuleEvaluation>(
  "AiRuleEvaluation",
)({
  _tag: Schema.Literal("AiRuleEvaluation"),
  ...sharedEvaluationFields,
  evaluator: AiEvaluator,
  gatePolicyId: Schema.NullOr(LabelingPolicyId),
  gatePolicyVersionId: Schema.NullOr(PolicyVersionId),
  gateTrace: Model.JsonFromString(Schema.NullOr(PolicyEvaluationTrace)),
}) {}

export const PolicyEvaluation = Model.Union([
  PolicyRuleEvaluation,
  AiRuleEvaluation,
])
export type PolicyEvaluation = typeof PolicyEvaluation.Type

export const PolicyActionExecutionId = Schema.String.pipe(
  Schema.brand("PolicyActionExecutionId"),
)
export class PolicyActionExecution extends Model.Class<PolicyActionExecution>(
  "PolicyActionExecution",
)({
  id: Model.UuidV7Insert(PolicyActionExecutionId),
  evaluationId: PolicyEvaluationId,
  repositoryId: GitHubRepositoryId,
  ruleId: LabelingRuleId,
  action: Schema.Literals(["add", "remove", "preserve"]),
  label: Schema.String,
  selected: Model.BooleanSqlite,
  status: Schema.Literals(["planned", "completed"]),
  applied: Model.BooleanSqlite,
  createdAt: Model.DateTimeInsertFromNumber,
}) {}
