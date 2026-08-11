import type * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as Data from "effect/Data"

export class LabelingRuleNotFound extends Data.TaggedError(
  "LabelingRuleNotFound",
)<{ readonly repository: string; readonly ruleId: string }> {}
export class DuplicateLabelingRule extends Data.TaggedError(
  "DuplicateLabelingRule",
)<{ readonly repository: string; readonly label: string }> {}
export class InvalidLabelingRule extends Data.TaggedError(
  "InvalidLabelingRule",
)<{ readonly message: string }> {}
export class LabelingRuleConflict extends Data.TaggedError(
  "LabelingRuleConflict",
)<{
  readonly repository: string
  readonly ruleId: string
  readonly currentRule: LabelingRule.LabelingRule
}> {}
export class StaleLabelingRulesRevision extends Data.TaggedError(
  "StaleLabelingRulesRevision",
)<{
  readonly repository: string
  readonly expectedRevision: number
  readonly actualRevision: number
  readonly currentRule: LabelingRule.LabelingRule | null
}> {}
export class GitHubLabelValidationError extends Data.TaggedError(
  "GitHubLabelValidationError",
)<{
  readonly reason: "MissingLabel" | "Unavailable"
  readonly repository: string
  readonly label?: string
  readonly retryable: boolean
  readonly message: string
}> {}
