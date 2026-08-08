import * as Schema from "effect/Schema"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"

export class Unauthenticated extends Schema.TaggedErrorClass<Unauthenticated>()(
  "Unauthenticated",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class RepositoryNotConfigured extends Schema.TaggedErrorClass<RepositoryNotConfigured>()(
  "RepositoryNotConfigured",
  { repository: Schema.String, message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class LabelingRuleNotFound extends Schema.TaggedErrorClass<LabelingRuleNotFound>()(
  "LabelingRuleNotFound",
  {
    repository: Schema.String,
    ruleId: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class GitHubLabelNotFound extends Schema.TaggedErrorClass<GitHubLabelNotFound>()(
  "GitHubLabelNotFound",
  {
    repository: Schema.String,
    label: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 422 },
) {}

export class InvalidLabelingRule extends Schema.TaggedErrorClass<InvalidLabelingRule>()(
  "InvalidLabelingRule",
  { message: Schema.String },
  { httpApiStatus: 422 },
) {}

export class DuplicateLabelingRule extends Schema.TaggedErrorClass<DuplicateLabelingRule>()(
  "DuplicateLabelingRule",
  {
    repository: Schema.String,
    label: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class LabelingRuleConflict extends Schema.TaggedErrorClass<LabelingRuleConflict>()(
  "LabelingRuleConflict",
  {
    repository: Schema.String,
    ruleId: Schema.String,
    currentRule: LabelingRuleManagement.PublicLabelingRule,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class LabelingRulesRevisionConflict extends Schema.TaggedErrorClass<LabelingRulesRevisionConflict>()(
  "LabelingRulesRevisionConflict",
  {
    repository: Schema.String,
    expectedRevision: Schema.Int,
    actualRevision: Schema.Int,
    currentRule: Schema.NullOr(LabelingRuleManagement.PublicLabelingRule),
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class GitHubLabelValidationUnavailable extends Schema.TaggedErrorClass<GitHubLabelValidationUnavailable>()(
  "GitHubLabelValidationUnavailable",
  {
    repository: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 503 },
) {}

export class PullRequestNotFound extends Schema.TaggedErrorClass<PullRequestNotFound>()(
  "PullRequestNotFound",
  {
    repository: Schema.String,
    pullRequestNumber: Schema.Int,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class LabelingRuleTestUnavailable extends Schema.TaggedErrorClass<LabelingRuleTestUnavailable>()(
  "LabelingRuleTestUnavailable",
  {
    repository: Schema.String,
    ruleId: Schema.String,
    pullRequestNumber: Schema.Int,
    retryable: Schema.Boolean,
    message: Schema.String,
  },
  { httpApiStatus: 503 },
) {}

export class RuleTestCandidatesUnavailable extends Schema.TaggedErrorClass<RuleTestCandidatesUnavailable>()(
  "RuleTestCandidatesUnavailable",
  {
    repository: Schema.String,
    retryable: Schema.Boolean,
    message: Schema.String,
  },
  { httpApiStatus: 503 },
) {}
