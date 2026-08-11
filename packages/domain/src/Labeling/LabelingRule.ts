import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
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

export class LabelingRule extends Model.Class<LabelingRule>("LabelingRule")({
  id: Model.UuidV7Insert(LabelingRuleId),
  repositoryId: GitHubRepositoryId,
  policyId: LabelingPolicyId,
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
}) {}
