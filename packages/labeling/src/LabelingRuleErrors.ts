import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as Data from "effect/Data"

export class LabelingRuleNotFound extends Data.TaggedError(
  "LabelingRuleNotFound",
)<{
  readonly repository: string
  readonly ruleId: string
}> {}

export class DuplicateLabelingRule extends Data.TaggedError(
  "DuplicateLabelingRule",
)<{
  readonly repository: string
  readonly label: string
}> {}

export class LabelingRuleConflict extends Data.TaggedError(
  "LabelingRuleConflict",
)<{
  readonly repository: string
  readonly ruleId: string
  readonly currentRule: LabelingRule.LabelingRule
}> {}

export class InvalidLabelingRule extends Data.TaggedError(
  "InvalidLabelingRule",
)<{
  readonly message: string
}> {}

export class GitHubLabelValidationError extends Data.TaggedError(
  "GitHubLabelValidationError",
)<{
  readonly reason: "Unavailable" | "MissingLabel"
  readonly repository: string
  readonly label?: string
  readonly retryable: boolean
  readonly message: string
}> {}

export class StaleLabelingRulesRevision extends Data.TaggedError(
  "StaleLabelingRulesRevision",
)<{
  readonly repositoryId: string
  readonly expectedRevision: number
  readonly actualRevision: number
}> {}
