import { Schema } from "effect"
import { Model } from "effect/unstable/schema"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import {
  LabelingRuleExclusiveGroup,
  LabelingRuleId,
  LabelingRuleInstructions,
  LabelingRuleKind,
  LabelingRuleMode,
  LabelingRuleValidationStatus,
} from "./LabelingRule.ts"

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

export const LabelingRuleAuditValue = Schema.Struct({
  id: LabelingRuleId,
  repositoryId: GitHubRepositoryId,
  label: GitHubLabel.GitHubLabelName,
  kind: Schema.optionalKey(LabelingRuleKind),
  instructions: LabelingRuleInstructions,
  mode: LabelingRuleMode,
  exclusiveGroup: LabelingRuleExclusiveGroup,
  enabled: Schema.Boolean,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  version: Schema.Int,
})
export type LabelingRuleAuditValue = typeof LabelingRuleAuditValue.Type

const AuditValueField = Model.JsonFromString(
  Schema.NullOr(LabelingRuleAuditValue),
)

export class LabelingRuleAuditEntry extends Model.Class<LabelingRuleAuditEntry>(
  "LabelingRuleAuditEntry",
)({
  id: Model.UuidV7Insert(LabelingRuleAuditEntryId),
  repositoryId: Model.GeneratedByApp(GitHubRepositoryId),
  ruleId: Model.GeneratedByApp(Schema.NullOr(LabelingRuleId)),
  actor: Model.GeneratedByApp(Schema.String),
  operation: Model.GeneratedByApp(LabelingRuleAuditOperation),
  before: AuditValueField,
  after: AuditValueField,
  createdAt: Model.DateTimeInsertFromNumber,
}) {}
