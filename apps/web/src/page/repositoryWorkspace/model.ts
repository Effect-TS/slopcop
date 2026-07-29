import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { Schema as S } from "effect"

export const RuleDraft = S.Struct({
  label: S.String,
  instructions: S.String,
  mode: LabelingRule.LabelingRuleMode,
  exclusiveGroup: S.String,
})
export type RuleDraft = typeof RuleDraft.Type

export const EditorClosed = S.TaggedStruct("Closed", {})
export const CreatingRule = S.TaggedStruct("Creating", {
  draft: RuleDraft,
  error: S.NullOr(S.String),
})
export const EditingRule = S.TaggedStruct("Editing", {
  ruleId: LabelingRule.LabelingRuleId,
  version: S.Int,
  draft: RuleDraft,
  error: S.NullOr(S.String),
  conflict: S.NullOr(LabelingRuleManagement.PublicLabelingRule),
})
export const RuleEditor = S.Union([EditorClosed, CreatingRule, EditingRule])
export type RuleEditor = typeof RuleEditor.Type

export const NoRuleNotice = S.TaggedStruct("NoNotice", {})
export const RuleOperationSucceeded = S.TaggedStruct("Succeeded", {
  message: S.String,
})
export const RuleOperationFailed = S.TaggedStruct("Failed", {
  message: S.String,
})
export const RuleNotice = S.Union([
  NoRuleNotice,
  RuleOperationSucceeded,
  RuleOperationFailed,
])

export const StatusFilter = S.Literals(["all", "active", "disabled"])
export type StatusFilter = typeof StatusFilter.Type

export const PendingOperation = S.Struct({
  operation: S.Literals([
    "create",
    "update",
    "enable",
    "disable",
    "validate",
    "delete",
  ]),
  ruleId: S.NullOr(LabelingRule.LabelingRuleId),
})

const AuditFilters = S.Struct({
  ruleId: S.NullOr(LabelingRule.LabelingRuleId),
  operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
})

export const AuditClosed = S.TaggedStruct("AuditClosed", {})
export const AuditLoading = S.TaggedStruct("AuditLoading", {
  ...AuditFilters.fields,
})
export const AuditFailed = S.TaggedStruct("AuditFailed", {
  ...AuditFilters.fields,
  message: S.String,
})
export const AuditReady = S.TaggedStruct("AuditReady", {
  ...AuditFilters.fields,
  entries: S.Array(LabelingRuleManagement.PublicLabelingRuleAuditEntry),
  nextCursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
})
export const AuditLoadingMore = S.TaggedStruct("AuditLoadingMore", {
  ...AuditFilters.fields,
  entries: S.Array(LabelingRuleManagement.PublicLabelingRuleAuditEntry),
  cursor: LabelingRuleManagement.LabelingRuleAuditCursor,
})
export const AuditState = S.Union([
  AuditClosed,
  AuditLoading,
  AuditFailed,
  AuditReady,
  AuditLoadingMore,
])
export type AuditState = typeof AuditState.Type

export const WorkspaceInactive = S.TaggedStruct("Inactive", {
  generation: S.Int,
})
export const WorkspaceLoading = S.TaggedStruct("Loading", {
  repository: LabelingRuleManagement.RepositoryPath,
  generation: S.Int,
})
export const WorkspaceFailed = S.TaggedStruct("Failed", {
  repository: LabelingRuleManagement.RepositoryPath,
  generation: S.Int,
  message: S.String,
})
export const WorkspaceReady = S.TaggedStruct("Ready", {
  repository: LabelingRuleManagement.RepositoryPath,
  generation: S.Int,
  revision: S.Int,
  rules: S.Array(LabelingRuleManagement.PublicLabelingRule),
  labels: S.Array(GitHubLabel.GitHubLabel),
  query: S.String,
  statusFilter: StatusFilter,
  editor: RuleEditor,
  pending: S.NullOr(PendingOperation),
  deletingRuleId: S.NullOr(LabelingRule.LabelingRuleId),
  notice: RuleNotice,
  audit: AuditState,
  auditSequence: S.Int,
})

export const Model = S.Union([
  WorkspaceInactive,
  WorkspaceLoading,
  WorkspaceFailed,
  WorkspaceReady,
])
export type Model = typeof Model.Type
