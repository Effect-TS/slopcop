import * as Schema from "effect/Schema"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositorySlug } from "../GitHub/GitHubRepository.ts"
import { LabelingPolicyId, LabelingPolicyName } from "./LabelingPolicy.ts"
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
import {
  LabelingRuleAuditEntryId,
  LabelingRuleAuditOperation,
} from "./LabelingRuleAuditEntry.ts"

export const RepositoryPath = GitHubRepositorySlug
export const RulePath = Schema.Struct({
  ...GitHubRepositorySlug.fields,
  ruleId: LabelingRuleId,
})
const PublicPolicy = Schema.Struct({
  id: LabelingPolicyId,
  name: LabelingPolicyName,
})
const publicSharedFields = {
  id: LabelingRuleId,
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
} as const
export const PublicPolicyLabelingRule = Schema.Struct({
  _tag: Schema.Literal("PolicyLabelingRule"),
  ...publicSharedFields,
  policyId: LabelingPolicyId,
  policy: PublicPolicy,
})
export const PublicAiLabelingRule = Schema.Struct({
  _tag: Schema.Literal("AiLabelingRule"),
  ...publicSharedFields,
  prompt: AiLabelingRulePrompt,
  evidence: AiLabelingRuleEvidence,
  minimumConfidence: AiLabelingRuleMinimumConfidence,
  evaluator: AiEvaluator,
  gatePolicyId: Schema.NullOr(LabelingPolicyId),
  gatePolicy: Schema.NullOr(PublicPolicy),
})
export const PublicLabelingRule = Schema.Union([
  PublicPolicyLabelingRule,
  PublicAiLabelingRule,
])
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

const publicAuditSharedFields = {
  id: LabelingRuleId,
  label: GitHubLabel.GitHubLabelName,
  onMatch: LabelOnMatch,
  onNoMatch: LabelOnNoMatch,
  conflictGroup: LabelingRuleConflictGroup,
  priority: Schema.Int,
  enabled: Schema.Boolean,
  validationStatus: LabelingRuleValidationStatus,
  validatedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  version: Schema.Int,
} as const
export const PublicPolicyLabelingRuleAuditValue = Schema.Struct({
  _tag: Schema.Literal("PolicyLabelingRule"),
  ...publicAuditSharedFields,
  policyId: LabelingPolicyId,
})
export const PublicAiLabelingRuleAuditValue = Schema.Struct({
  _tag: Schema.Literal("AiLabelingRule"),
  ...publicAuditSharedFields,
  prompt: AiLabelingRulePrompt,
  evidence: AiLabelingRuleEvidence,
  minimumConfidence: AiLabelingRuleMinimumConfidence,
  evaluator: AiEvaluator,
  gatePolicyId: Schema.NullOr(LabelingPolicyId),
})
export const PublicLegacyPolicyLabelingRuleAuditValue = Schema.Struct({
  ...publicAuditSharedFields,
  policyId: LabelingPolicyId,
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
export const PublicLabelingRuleAuditValue = Schema.Union([
  PublicPolicyLabelingRuleAuditValue,
  PublicAiLabelingRuleAuditValue,
  PublicLegacyPolicyLabelingRuleAuditValue,
  PublicLegacyLabelingRuleAuditValue,
])
export const PublicLabelingRuleAuditEntry = Schema.Struct({
  id: LabelingRuleAuditEntryId,
  ruleId: LabelingRuleId,
  actor: Schema.String,
  operation: LabelingRuleAuditOperation,
  before: Schema.NullOr(PublicLabelingRuleAuditValue),
  after: Schema.NullOr(PublicLabelingRuleAuditValue),
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

const createSharedFields = {
  label: GitHubLabel.GitHubLabelName,
  onMatch: LabelOnMatch,
  onNoMatch: LabelOnNoMatch,
  conflictGroup: Schema.optionalKey(LabelingRuleConflictGroup),
  priority: Schema.optionalKey(Schema.Int),
  enabled: Schema.Boolean,
} as const
export const CreatePolicyLabelingRuleRequest = Schema.Struct({
  _tag: Schema.Literal("PolicyLabelingRule"),
  ...createSharedFields,
  policyId: LabelingPolicyId,
})
export const CreateAiLabelingRuleRequest = Schema.Struct({
  _tag: Schema.Literal("AiLabelingRule"),
  ...createSharedFields,
  prompt: AiLabelingRulePrompt,
  evidence: AiLabelingRuleEvidence,
  minimumConfidence: AiLabelingRuleMinimumConfidence,
  evaluator: AiEvaluator,
  gatePolicyId: Schema.NullOr(LabelingPolicyId),
})
export const CreateLabelingRuleRequest = Schema.Union([
  CreatePolicyLabelingRuleRequest,
  CreateAiLabelingRuleRequest,
])
export type CreateLabelingRuleRequest = typeof CreateLabelingRuleRequest.Type

const patchSharedFields = {
  label: Schema.optionalKey(GitHubLabel.GitHubLabelName),
  onNoMatch: Schema.optionalKey(LabelOnNoMatch),
  conflictGroup: Schema.optionalKey(LabelingRuleConflictGroup),
  priority: Schema.optionalKey(Schema.Int),
  enabled: Schema.optionalKey(Schema.Boolean),
  version: Schema.Int,
} as const
export const PatchPolicyLabelingRuleRequest = Schema.Struct({
  _tag: Schema.Literal("PolicyLabelingRule"),
  ...patchSharedFields,
  policyId: Schema.optionalKey(LabelingPolicyId),
})
export const PatchAiLabelingRuleRequest = Schema.Struct({
  _tag: Schema.Literal("AiLabelingRule"),
  ...patchSharedFields,
  prompt: Schema.optionalKey(AiLabelingRulePrompt),
  evidence: Schema.optionalKey(AiLabelingRuleEvidence),
  minimumConfidence: Schema.optionalKey(AiLabelingRuleMinimumConfidence),
  evaluator: Schema.optionalKey(AiEvaluator),
  gatePolicyId: Schema.optionalKey(Schema.NullOr(LabelingPolicyId)),
})
export const PatchLabelingRuleRequest = Schema.Union([
  PatchPolicyLabelingRuleRequest,
  PatchAiLabelingRuleRequest,
])
export type PatchLabelingRuleRequest = typeof PatchLabelingRuleRequest.Type
export const RuleVersionRequest = Schema.Struct({ version: Schema.Int })
export const RuleVersionQuery = RuleVersionRequest
export const TestLabelingRuleRequest = Schema.Struct({
  pullRequestNumber: Schema.Int.check(Schema.isGreaterThan(0)),
})
const testResponseSharedFields = {
  ruleId: LabelingRuleId,
  pullRequestNumber: Schema.Int.check(Schema.isGreaterThan(0)),
  outcome: Schema.Literals(["Match", "NoMatch", "Abstain"]),
  confidence: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  rationale: Schema.String,
  proposedAction: Schema.Literals(["add", "remove", "preserve"]),
  proposedLabelChanges: Schema.Struct({
    add: Schema.Array(GitHubLabel.GitHubLabelName),
    remove: Schema.Array(GitHubLabel.GitHubLabelName),
  }),
} as const
export const TestPolicyLabelingRuleResponse = Schema.Struct({
  _tag: Schema.Literal("PolicyLabelingRule"),
  ...testResponseSharedFields,
  policyId: LabelingPolicyId,
})
export const TestAiLabelingRuleResponse = Schema.Struct({
  _tag: Schema.Literal("AiLabelingRule"),
  ...testResponseSharedFields,
  gatePolicyId: Schema.NullOr(LabelingPolicyId),
})
export const TestLabelingRuleResponse = Schema.Union([
  TestPolicyLabelingRuleResponse,
  TestAiLabelingRuleResponse,
])
