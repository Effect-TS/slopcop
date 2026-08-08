import * as Schema from "effect/Schema"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositorySlug } from "../GitHub/GitHubRepository.ts"
import {
  LabelingRuleConfidenceThreshold,
  LabelingRuleExclusiveGroup,
  LabelingRuleId,
  LabelingRuleInstructions,
  LabelingRuleKind,
  LabelingRuleMode,
  LabelingRuleName,
  LabelingRuleValidationStatus,
} from "./LabelingRule.ts"
import {
  LabelingRuleAuditEntryId,
  LabelingRuleAuditOperation,
} from "./LabelingRuleAuditEntry.ts"

export const RepositoryPath = GitHubRepositorySlug

export const RulePath = Schema.Struct({
  ...GitHubRepositorySlug.fields,
  ruleId: LabelingRuleId,
})

export const PublicLabelingRule = Schema.Struct({
  id: LabelingRuleId,
  name: LabelingRuleName,
  label: GitHubLabel.GitHubLabelName,
  kind: LabelingRuleKind,
  instructions: LabelingRuleInstructions,
  confidenceThreshold: LabelingRuleConfidenceThreshold,
  mode: LabelingRuleMode,
  exclusiveGroup: LabelingRuleExclusiveGroup,
  enabled: Schema.Boolean,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  version: Schema.Int,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
})

export const ListLabelingRulesQuery = Schema.Struct({
  includeDisabled: Schema.optionalKey(Schema.Boolean),
})

export const ListLabelingRulesResponse = Schema.Struct({
  repository: Schema.String,
  revision: Schema.Int,
  rules: Schema.Array(PublicLabelingRule),
})

export const PublicLabelingRuleAuditValue = Schema.Struct({
  id: LabelingRuleId,
  name: LabelingRuleName,
  label: GitHubLabel.GitHubLabelName,
  kind: LabelingRuleKind,
  instructions: LabelingRuleInstructions,
  confidenceThreshold: LabelingRuleConfidenceThreshold,
  mode: LabelingRuleMode,
  exclusiveGroup: LabelingRuleExclusiveGroup,
  enabled: Schema.Boolean,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  version: Schema.Int,
})

export const PublicLabelingRuleAuditEntry = Schema.Struct({
  id: LabelingRuleAuditEntryId,
  ruleId: LabelingRuleId,
  actor: Schema.String,
  operation: LabelingRuleAuditOperation,
  before: Schema.NullOr(PublicLabelingRuleAuditValue),
  after: Schema.NullOr(PublicLabelingRuleAuditValue),
  createdAt: Schema.DateTimeUtcFromString,
})

export const LabelingRuleAuditFilterOperation = Schema.Union([
  Schema.Literal("all"),
  LabelingRuleAuditOperation,
])

export const LabelingRuleAuditCursor = Schema.String.check(
  Schema.isPattern(/^\d+:.+$/),
)

export const ListLabelingRuleAuditQuery = Schema.Struct({
  ruleId: Schema.optionalKey(LabelingRuleId),
  operation: Schema.optionalKey(LabelingRuleAuditOperation),
  cursor: Schema.optionalKey(LabelingRuleAuditCursor),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  ),
})

export const ListLabelingRuleAuditResponse = Schema.Struct({
  entries: Schema.Array(PublicLabelingRuleAuditEntry),
  nextCursor: Schema.NullOr(LabelingRuleAuditCursor),
})

export const PublicLabelingRuleActivityEntry = Schema.Struct({
  repository: RepositoryPath,
  ...PublicLabelingRuleAuditEntry.fields,
})

export const ListLabelingRuleActivityQuery = Schema.Struct({
  repository: Schema.optionalKey(Schema.String),
  operation: Schema.optionalKey(LabelingRuleAuditOperation),
  cursor: Schema.optionalKey(LabelingRuleAuditCursor),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  ),
})

export const ListLabelingRuleActivityResponse = Schema.Struct({
  entries: Schema.Array(PublicLabelingRuleActivityEntry),
  nextCursor: Schema.NullOr(LabelingRuleAuditCursor),
})

export const ListGitHubLabelsResponse = Schema.Struct({
  labels: Schema.Array(GitHubLabel.GitHubLabel),
})

export const ValidateCandidateLabelRequest = Schema.Struct({
  label: GitHubLabel.GitHubLabelName,
})

export const ValidateCandidateLabelResponse =
  GitHubLabel.GitHubLabelValidationResult

export const CreateLabelingRuleRequest = Schema.Struct({
  name: LabelingRuleName,
  label: GitHubLabel.GitHubLabelName,
  kind: Schema.optionalKey(LabelingRuleKind),
  instructions: LabelingRuleInstructions,
  confidenceThreshold: LabelingRuleConfidenceThreshold,
  mode: LabelingRuleMode,
  exclusiveGroup: LabelingRuleExclusiveGroup,
  enabled: Schema.Boolean,
})

export type CreateLabelingRuleRequest = typeof CreateLabelingRuleRequest.Type

export const PatchLabelingRuleRequest = Schema.Struct({
  name: Schema.optionalKey(LabelingRuleName),
  label: Schema.optionalKey(GitHubLabel.GitHubLabelName),
  kind: Schema.optionalKey(LabelingRuleKind),
  instructions: Schema.optionalKey(LabelingRuleInstructions),
  confidenceThreshold: Schema.optionalKey(LabelingRuleConfidenceThreshold),
  mode: Schema.optionalKey(LabelingRuleMode),
  exclusiveGroup: Schema.optionalKey(LabelingRuleExclusiveGroup),
  enabled: Schema.optionalKey(Schema.Boolean),
  version: Schema.Int,
})

export type PatchLabelingRuleRequest = typeof PatchLabelingRuleRequest.Type

export const RuleVersionRequest = Schema.Struct({
  version: Schema.Int,
})

export const RuleVersionQuery = Schema.Struct({
  version: Schema.Int,
})
