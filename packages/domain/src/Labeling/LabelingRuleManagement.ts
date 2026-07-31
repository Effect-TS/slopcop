import * as Schema from "effect/Schema"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositorySlug } from "../GitHub/GitHubRepository.ts"
import {
  LabelingRuleExclusiveGroup,
  LabelingRuleId,
  LabelingRuleInstructions,
  LabelingRuleKind,
  LabelingRuleMode,
  LabelingRuleValidationStatus,
} from "./LabelingRule.ts"

export const RepositoryPath = GitHubRepositorySlug

export const RulePath = Schema.Struct({
  ...GitHubRepositorySlug.fields,
  ruleId: LabelingRuleId,
})

export const PublicLabelingRule = Schema.Struct({
  id: LabelingRuleId,
  label: GitHubLabel.GitHubLabelName,
  kind: LabelingRuleKind,
  instructions: LabelingRuleInstructions,
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

export const ListGitHubLabelsResponse = Schema.Struct({
  labels: Schema.Array(GitHubLabel.GitHubLabel),
})

export const ValidateCandidateLabelRequest = Schema.Struct({
  label: GitHubLabel.GitHubLabelName,
})

export const ValidateCandidateLabelResponse =
  GitHubLabel.GitHubLabelValidationResult

export const CreateLabelingRuleRequest = Schema.Struct({
  label: GitHubLabel.GitHubLabelName,
  kind: Schema.optionalKey(LabelingRuleKind),
  instructions: LabelingRuleInstructions,
  mode: LabelingRuleMode,
  exclusiveGroup: LabelingRuleExclusiveGroup,
  enabled: Schema.Boolean,
})

export type CreateLabelingRuleRequest = typeof CreateLabelingRuleRequest.Type

export const PatchLabelingRuleRequest = Schema.Struct({
  label: Schema.optionalKey(GitHubLabel.GitHubLabelName),
  kind: Schema.optionalKey(LabelingRuleKind),
  instructions: Schema.optionalKey(LabelingRuleInstructions),
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
