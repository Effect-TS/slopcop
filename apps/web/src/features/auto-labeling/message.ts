import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"
import {
  MutationConflict,
  Repository,
  RuleDraft,
  RuleId,
  RuleKind,
  RuleMode,
} from "./model"

export const SelectedRepositoryChanged = m("SelectedRepositoryChanged", {
  repository: Schema.NullOr(Repository),
})
export const RetriedRepositoryLoad = m("RetriedRepositoryLoad")
export const LoadedRepositoryData = m("LoadedRepositoryData", {
  requestId: Schema.Int,
  repository: Repository,
  revision: Schema.Int,
  rules: Schema.Array(LabelingRuleManagement.PublicLabelingRule),
  activity: LabelingRuleManagement.LabelingRuleActivitySummary,
  labels: Schema.Array(GitHubLabel.GitHubLabel),
})
export const FailedToLoadRepositoryData = m("FailedToLoadRepositoryData", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
})

export const OpenedNewRule = m("OpenedNewRule")
export const OpenedRuleEditor = m("OpenedRuleEditor", { ruleId: RuleId })
export const ClosedRuleEditor = m("ClosedRuleEditor")
export const SavedRule = m("SavedRule")
export const RetriedRuleSave = m("RetriedRuleSave")
export const ReloadedRuleEditor = m("ReloadedRuleEditor")
export const CompletedSaveRule = m("CompletedSaveRule", {
  requestId: Schema.Int,
  repository: Repository,
  rule: LabelingRuleManagement.PublicLabelingRule,
})
export const FailedToSaveRule = m("FailedToSaveRule", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
  conflict: Schema.NullOr(MutationConflict),
})

export const ToggledRuleMenu = m("ToggledRuleMenu", { ruleId: RuleId })
export const ToggledRule = m("ToggledRule", { ruleId: RuleId })
export const CompletedToggleRule = m("CompletedToggleRule", {
  requestId: Schema.Int,
  repository: Repository,
  rule: LabelingRuleManagement.PublicLabelingRule,
})
export const FailedToToggleRule = m("FailedToToggleRule", {
  requestId: Schema.Int,
  repository: Repository,
  ruleId: RuleId,
  message: Schema.String,
  conflict: Schema.NullOr(MutationConflict),
})
export const RetriedToggleRule = m("RetriedToggleRule")
export const DismissedRowMutationError = m("DismissedRowMutationError")

export const OpenedDeleteRule = m("OpenedDeleteRule", { ruleId: RuleId })
export const DismissedDeleteRule = m("DismissedDeleteRule")
export const ConfirmedDeleteRule = m("ConfirmedDeleteRule")
export const CompletedDeleteRule = m("CompletedDeleteRule", {
  requestId: Schema.Int,
  repository: Repository,
  ruleId: RuleId,
})
export const FailedToDeleteRule = m("FailedToDeleteRule", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
  conflict: Schema.NullOr(MutationConflict),
})
export const RetriedDeleteRule = m("RetriedDeleteRule")

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
  RetriedRuleSave,
  ReloadedRuleEditor,
  CompletedSaveRule,
  FailedToSaveRule,
  ToggledRuleMenu,
  ToggledRule,
  CompletedToggleRule,
  FailedToToggleRule,
  RetriedToggleRule,
  DismissedRowMutationError,
  OpenedDeleteRule,
  DismissedDeleteRule,
  ConfirmedDeleteRule,
  CompletedDeleteRule,
  FailedToDeleteRule,
  RetriedDeleteRule,
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
