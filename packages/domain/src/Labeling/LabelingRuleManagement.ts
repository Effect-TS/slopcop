import * as Schema from "effect/Schema"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositorySlug } from "../GitHub/GitHubRepository.ts"
import { LabelingPolicyId, LabelingPolicyName } from "./LabelingPolicy.ts"
import {
  LabelingRuleConflictGroup,
  LabelingRuleId,
  LabelingRuleValidationStatus,
  LabelOnMatch,
  LabelOnNoMatch,
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
  policyId: LabelingPolicyId,
  label: GitHubLabel.GitHubLabelName,
  onMatch: LabelOnMatch,
  onNoMatch: LabelOnNoMatch,
  conflictGroup: LabelingRuleConflictGroup,
  priority: Schema.Int,
  enabled: Schema.Boolean,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  version: Schema.Int,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
  policy: Schema.Struct({
    id: LabelingPolicyId,
    name: LabelingPolicyName,
    published: Schema.Boolean,
  }),
})
export type PublicLabelingRule = typeof PublicLabelingRule.Type

export const ListLabelingRulesQuery = Schema.Struct({
  includeDisabled: Schema.optionalKey(Schema.Boolean),
})
export const LabelingRuleFireCount = Schema.Struct({
  ruleId: LabelingRuleId,
  fires: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export const LabelingRuleActivitySummary = Schema.Struct({
  windowDays: Schema.Literal(30),
  totalFires: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  rules: Schema.Array(LabelingRuleFireCount),
})
export const ListLabelingRulesResponse = Schema.Struct({
  repository: Schema.String,
  revision: Schema.Int,
  rules: Schema.Array(PublicLabelingRule),
  activity: LabelingRuleActivitySummary,
})

export const PublicLabelingRuleAuditValue = Schema.Struct({
  id: LabelingRuleId,
  policyId: LabelingPolicyId,
  label: GitHubLabel.GitHubLabelName,
  onMatch: LabelOnMatch,
  onNoMatch: LabelOnNoMatch,
  conflictGroup: LabelingRuleConflictGroup,
  priority: Schema.Int,
  enabled: Schema.Boolean,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  version: Schema.Int,
})
export const PublicLegacyLabelingRuleAuditValue = Schema.Struct({
  id: LabelingRuleId,
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
export const PublicLabelingRuleAuditEntry = Schema.Struct({
  id: LabelingRuleAuditEntryId,
  ruleId: LabelingRuleId,
  actor: Schema.String,
  operation: LabelingRuleAuditOperation,
  before: Schema.NullOr(
    Schema.Union([
      PublicLabelingRuleAuditValue,
      PublicLegacyLabelingRuleAuditValue,
    ]),
  ),
  after: Schema.NullOr(
    Schema.Union([
      PublicLabelingRuleAuditValue,
      PublicLegacyLabelingRuleAuditValue,
    ]),
  ),
  createdAt: Schema.DateTimeUtcFromString,
})
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
export const ListRuleTestCandidatesQuery = Schema.Struct({
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  ),
})
export const RuleTestCandidate = Schema.Struct({
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  title: Schema.String,
  draft: Schema.Boolean,
  author: Schema.NullOr(Schema.String),
  updatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
})
export type RuleTestCandidate = typeof RuleTestCandidate.Type
export const ListRuleTestCandidatesResponse = Schema.Struct({
  candidates: Schema.Array(RuleTestCandidate),
})
export const ValidateCandidateLabelRequest = Schema.Struct({
  label: GitHubLabel.GitHubLabelName,
})
export const ValidateCandidateLabelResponse =
  GitHubLabel.GitHubLabelValidationResult

export const CreateLabelingRuleRequest = Schema.Struct({
  policyId: LabelingPolicyId,
  label: GitHubLabel.GitHubLabelName,
  onMatch: LabelOnMatch,
  onNoMatch: LabelOnNoMatch,
  conflictGroup: Schema.optionalKey(LabelingRuleConflictGroup),
  priority: Schema.optionalKey(Schema.Int),
  enabled: Schema.Boolean,
})
export type CreateLabelingRuleRequest = typeof CreateLabelingRuleRequest.Type
export const PatchLabelingRuleRequest = Schema.Struct({
  policyId: Schema.optionalKey(LabelingPolicyId),
  label: Schema.optionalKey(GitHubLabel.GitHubLabelName),
  onNoMatch: Schema.optionalKey(LabelOnNoMatch),
  conflictGroup: Schema.optionalKey(LabelingRuleConflictGroup),
  priority: Schema.optionalKey(Schema.Int),
  enabled: Schema.optionalKey(Schema.Boolean),
  version: Schema.Int,
})
export type PatchLabelingRuleRequest = typeof PatchLabelingRuleRequest.Type
export const RuleVersionRequest = Schema.Struct({ version: Schema.Int })
export const RuleVersionQuery = RuleVersionRequest
export const TestLabelingRuleRequest = Schema.Struct({
  pullRequestNumber: Schema.Int.check(Schema.isGreaterThan(0)),
})
export const TestLabelingRuleResponse = Schema.Struct({
  ruleId: LabelingRuleId,
  policyId: LabelingPolicyId,
  pullRequestNumber: Schema.Int.check(Schema.isGreaterThan(0)),
  outcome: Schema.Literals(["Match", "NoMatch", "Abstain"]),
  confidence: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  rationale: Schema.String,
  proposedAction: Schema.Literals(["add", "remove", "preserve"]),
  proposedLabelChanges: Schema.Struct({
    add: Schema.Array(GitHubLabel.GitHubLabelName),
    remove: Schema.Array(GitHubLabel.GitHubLabelName),
  }),
})
