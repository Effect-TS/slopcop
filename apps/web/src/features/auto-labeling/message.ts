import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"
import { Repository, RuleDraft, RuleId, RuleKind, RuleMode } from "./model"

export const SelectedRepositoryChanged = m("SelectedRepositoryChanged", {
  repository: Schema.NullOr(Repository),
})
export const RetriedRepositoryLoad = m("RetriedRepositoryLoad")
export const LoadedRepositoryData = m("LoadedRepositoryData", {
  repository: Repository,
  revision: Schema.Int,
  rules: Schema.Array(LabelingRuleManagement.PublicLabelingRule),
  activity: LabelingRuleManagement.LabelingRuleActivitySummary,
  labels: Schema.Array(GitHubLabel.GitHubLabel),
})
export const FailedToLoadRepositoryData = m("FailedToLoadRepositoryData", {
  repository: Repository,
  message: Schema.String,
})

export const OpenedNewRule = m("OpenedNewRule")
export const OpenedRuleEditor = m("OpenedRuleEditor", { ruleId: RuleId })
export const ClosedRuleEditor = m("ClosedRuleEditor")
export const SavedRule = m("SavedRule")
export const CompletedSaveRule = m("CompletedSaveRule", {
  repository: Repository,
  rule: LabelingRuleManagement.PublicLabelingRule,
})
export const FailedToSaveRule = m("FailedToSaveRule", {
  repository: Repository,
  message: Schema.String,
  currentRule: Schema.NullOr(LabelingRuleManagement.PublicLabelingRule),
})

export const ToggledRuleMenu = m("ToggledRuleMenu", { ruleId: RuleId })
export const ToggledRule = m("ToggledRule", { ruleId: RuleId })
export const CompletedToggleRule = m("CompletedToggleRule", {
  repository: Repository,
  rule: LabelingRuleManagement.PublicLabelingRule,
})
export const FailedToToggleRule = m("FailedToToggleRule", {
  repository: Repository,
  ruleId: RuleId,
  message: Schema.String,
})

export const OpenedDeleteRule = m("OpenedDeleteRule", { ruleId: RuleId })
export const DismissedDeleteRule = m("DismissedDeleteRule")
export const ConfirmedDeleteRule = m("ConfirmedDeleteRule")
export const CompletedDeleteRule = m("CompletedDeleteRule", {
  repository: Repository,
  ruleId: RuleId,
})
export const FailedToDeleteRule = m("FailedToDeleteRule", {
  repository: Repository,
  message: Schema.String,
})

export const OpenedRuleTest = m("OpenedRuleTest", { ruleId: RuleId })
export const LoadedRuleTestCandidates = m("LoadedRuleTestCandidates", {
  repository: Repository,
  ruleId: RuleId,
  candidates: Schema.Array(LabelingRuleManagement.RuleTestCandidate),
})
export const FailedToLoadRuleTestCandidates = m(
  "FailedToLoadRuleTestCandidates",
  { repository: Repository, ruleId: RuleId, message: Schema.String },
)
export const SelectedRuleTestCandidate = m("SelectedRuleTestCandidate", {
  pullRequestNumber: Schema.Int,
})
export const RanRuleTest = m("RanRuleTest")
export const CompletedRuleTest = m("CompletedRuleTest", {
  repository: Repository,
  result: LabelingRuleManagement.TestLabelingRuleResponse,
})
export const FailedRuleTest = m("FailedRuleTest", {
  repository: Repository,
  message: Schema.String,
})
export const ResetRuleTest = m("ResetRuleTest")
export const DismissedRuleTest = m("DismissedRuleTest")

export const UpdatedRuleName = m("UpdatedRuleName", { name: Schema.String })
export const UpdatedRuleLabel = m("UpdatedRuleLabel", { label: Schema.String })
export const UpdatedRuleConfidence = m("UpdatedRuleConfidence", {
  confidenceThreshold: Schema.Number,
})
export const UpdatedRuleMode = m("UpdatedRuleMode", { mode: RuleMode })
export const UpdatedRuleKind = m("UpdatedRuleKind", { kind: RuleKind })
export const UpdatedRuleExclusiveGroup = m("UpdatedRuleExclusiveGroup", {
  exclusiveGroup: Schema.String,
})
export const UpdatedRulePrompt = m("UpdatedRulePrompt", {
  instructions: Schema.String,
})

export const Message = Schema.Union([
  SelectedRepositoryChanged,
  RetriedRepositoryLoad,
  LoadedRepositoryData,
  FailedToLoadRepositoryData,
  OpenedNewRule,
  OpenedRuleEditor,
  ClosedRuleEditor,
  SavedRule,
  CompletedSaveRule,
  FailedToSaveRule,
  ToggledRuleMenu,
  ToggledRule,
  CompletedToggleRule,
  FailedToToggleRule,
  OpenedDeleteRule,
  DismissedDeleteRule,
  ConfirmedDeleteRule,
  CompletedDeleteRule,
  FailedToDeleteRule,
  OpenedRuleTest,
  LoadedRuleTestCandidates,
  FailedToLoadRuleTestCandidates,
  SelectedRuleTestCandidate,
  RanRuleTest,
  CompletedRuleTest,
  FailedRuleTest,
  ResetRuleTest,
  DismissedRuleTest,
  UpdatedRuleName,
  UpdatedRuleLabel,
  UpdatedRuleConfidence,
  UpdatedRuleMode,
  UpdatedRuleKind,
  UpdatedRuleExclusiveGroup,
  UpdatedRulePrompt,
])
export type Message = typeof Message.Type

export type { RuleDraft }
