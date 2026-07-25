import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import { lifecycleTimestamps } from "../Shared/Timestamps.ts"

export const LabelingRuleId = Schema.String.pipe(Schema.brand("LabelingRuleId"))

export const LabelingRuleInstructions = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(4_000),
)

export const LabelingRuleMode = Schema.Literals(["add-only", "reconcile"])

export const LabelingRuleExclusiveGroup = Schema.NullOr(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
)

export const LabelingRuleValidationStatus = Schema.Literals([
  "valid",
  "missing",
  "unknown",
])

export class LabelingRule extends Model.Class<LabelingRule>("LabelingRule")({
  id: Model.UuidV7Insert(LabelingRuleId),
  repositoryId: GitHubRepositoryId,
  label: GitHubLabel.GitHubLabelName,
  instructions: LabelingRuleInstructions,
  mode: LabelingRuleMode,
  exclusiveGroup: LabelingRuleExclusiveGroup,
  enabled: Model.BooleanSqlite,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromMillis),
  version: Schema.Int,
  ...lifecycleTimestamps,
}) {}
