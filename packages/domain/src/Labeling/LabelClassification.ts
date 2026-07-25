import { Schema } from "effect"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import * as GitHubPullRequest from "../GitHub/GitHubPullRequest.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import {
  LabelingRule,
  LabelingRuleExclusiveGroup,
  LabelingRuleId,
  LabelingRuleInstructions,
} from "./LabelingRule.ts"

export const MAX_CLASSIFICATION_RULES = 50
export const MAX_FILES = 100
export const MAX_PATCH_CHARS_PER_FILE = 4_000
export const MAX_TOTAL_PATCH_CHARS = 40_000

export const ChangedFileEvidence = Schema.Struct({
  filename: Schema.String.check(Schema.isMinLength(1)),
  status: GitHubPullRequest.GitHubPullRequestFileStatus,
  patch: Schema.NullOr(
    Schema.String.check(Schema.isMaxLength(MAX_PATCH_CHARS_PER_FILE)),
  ),
  patchTruncated: Schema.Boolean,
})
export type ChangedFileEvidence = typeof ChangedFileEvidence.Type

export const ChangedFilesEvidence = Schema.Array(ChangedFileEvidence).check(
  Schema.isMaxLength(MAX_FILES),
  Schema.makeFilter<ReadonlyArray<ChangedFileEvidence>>((files) =>
    files.reduce((total, file) => total + (file.patch?.length ?? 0), 0) <=
    MAX_TOTAL_PATCH_CHARS
      ? true
      : `total patch content must not exceed ${MAX_TOTAL_PATCH_CHARS} characters`,
  ),
)
export type ChangedFilesEvidence = typeof ChangedFilesEvidence.Type

export const PullRequestClassificationSubject = Schema.Struct({
  type: Schema.Literal("pull_request"),
  number: Schema.Int,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  baseRef: Schema.String,
  headSha: Schema.String,
  files: ChangedFilesEvidence,
})
export type PullRequestClassificationSubject =
  typeof PullRequestClassificationSubject.Type

export const ClassificationRule = Schema.Struct({
  id: LabelingRuleId,
  label: GitHubLabel.GitHubLabelName,
  instructions: LabelingRuleInstructions,
  exclusiveGroup: LabelingRuleExclusiveGroup,
})
export type ClassificationRule = typeof ClassificationRule.Type

export const ClassificationRuleSet = Schema.Struct({
  revision: Schema.Int,
  rules: Schema.Array(ClassificationRule).check(
    Schema.isMaxLength(MAX_CLASSIFICATION_RULES),
  ),
})
export type ClassificationRuleSet = typeof ClassificationRuleSet.Type

export const ClassificationInput = Schema.Struct({
  subject: PullRequestClassificationSubject,
  ruleSet: ClassificationRuleSet,
})
export type ClassificationInput = typeof ClassificationInput.Type

export const RuleDecision = Schema.Struct({
  ruleId: LabelingRuleId,
  applies: Schema.Boolean,
  confidence: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  rationale: Schema.String.check(Schema.isMaxLength(4_000)),
})
export type RuleDecision = typeof RuleDecision.Type

export const ClassificationResult = Schema.Struct({
  rulesRevision: Schema.Int,
  decisions: Schema.Array(RuleDecision).check(
    Schema.isMaxLength(MAX_CLASSIFICATION_RULES),
  ),
})
export type ClassificationResult = typeof ClassificationResult.Type

export const LabelingRuleSet = Schema.Struct({
  repositoryId: GitHubRepositoryId,
  revision: Schema.Int,
  rules: Schema.Array(LabelingRule).check(
    Schema.isMaxLength(MAX_CLASSIFICATION_RULES),
  ),
})
export type LabelingRuleSet = typeof LabelingRuleSet.Type

export const LabelChanges = Schema.Struct({
  add: Schema.Array(GitHubLabel.GitHubLabelName),
  remove: Schema.Array(GitHubLabel.GitHubLabelName),
})
export type LabelChanges = typeof LabelChanges.Type

export const AppliedLabelChanges = Schema.Struct({
  added: Schema.Array(GitHubLabel.GitHubLabelName),
  removed: Schema.Array(GitHubLabel.GitHubLabelName),
})
export type AppliedLabelChanges = typeof AppliedLabelChanges.Type
