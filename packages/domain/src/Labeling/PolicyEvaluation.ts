import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import { GitHubEventId } from "../GitHub/GitHubEvent.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import {
  PolicyNodeTrace,
  PolicyEvaluationOutcome,
  PolicyTarget,
  PolicyVersionId,
} from "../Policy/PolicyProgram.ts"
import { LabelingPolicyId } from "./LabelingPolicy.ts"
import { LabelingRuleId } from "./LabelingRule.ts"

export const PolicyEvaluationId = Schema.String.pipe(
  Schema.brand("PolicyEvaluationId"),
)
const LegacyPolicyNodeTrace = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  outcome: Schema.Literals(["Match", "NoMatch", "Abstain"]),
  rationale: Schema.String,
})
const PersistedPolicyNodeTrace = Schema.Union([
  PolicyNodeTrace,
  LegacyPolicyNodeTrace,
])
export class PolicyEvaluation extends Model.Class<PolicyEvaluation>(
  "PolicyEvaluation",
)({
  id: Model.UuidV7Insert(PolicyEvaluationId),
  deliveryId: GitHubEventId,
  repositoryId: GitHubRepositoryId,
  policyId: LabelingPolicyId,
  policyVersionId: PolicyVersionId,
  target: PolicyTarget,
  subjectNumber: Schema.Int,
  headSha: Schema.NullOr(Schema.String),
  automationRevision: Schema.Int,
  outcome: PolicyEvaluationOutcome,
  confidence: Schema.Number,
  rationale: Schema.String,
  trace: Model.JsonFromString(Schema.Array(PersistedPolicyNodeTrace)),
  createdAt: Model.DateTimeInsertFromNumber,
}) {}

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
