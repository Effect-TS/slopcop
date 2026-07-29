import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { Schema as S } from "effect"
import { m } from "foldkit/message"

import { StatusFilter } from "./model"

const repositoryFields = LabelingRuleManagement.RepositoryPath.fields

export const ChangedRoute = m("ChangedRoute", repositoryFields)
export const LeftRoute = m("LeftRoute")
export const RequestedWorkspace = m("RequestedWorkspace")
export const LoadedWorkspace = m("LoadedWorkspace", {
  ...repositoryFields,
  generation: S.Int,
  revision: S.Int,
  rules: S.Array(LabelingRuleManagement.PublicLabelingRule),
  labels: S.Array(GitHubLabel.GitHubLabel),
})
export const FailedToLoadWorkspace = m("FailedToLoadWorkspace", {
  ...repositoryFields,
  generation: S.Int,
  message: S.String,
})
export const ChangedRuleQuery = m("ChangedRuleQuery", { query: S.String })
export const ChangedStatusFilter = m("ChangedStatusFilter", {
  statusFilter: StatusFilter,
})
export const ClickedCreateRule = m("ClickedCreateRule")
export const ClickedEditRule = m("ClickedEditRule", {
  ruleId: LabelingRule.LabelingRuleId,
})
export const ClosedRuleEditor = m("ClosedRuleEditor")
export const ChangedDraftLabel = m("ChangedDraftLabel", { label: S.String })
export const ChangedDraftInstructions = m("ChangedDraftInstructions", {
  instructions: S.String,
})
export const ChangedDraftMode = m("ChangedDraftMode", {
  mode: LabelingRule.LabelingRuleMode,
})
export const ChangedDraftExclusiveGroup = m("ChangedDraftExclusiveGroup", {
  exclusiveGroup: S.String,
})
export const SubmittedRule = m("SubmittedRule")
export const UsedLatestRule = m("UsedLatestRule")
export const CreatedRule = m("CreatedRule", {
  ...repositoryFields,
  generation: S.Int,
  rule: LabelingRuleManagement.PublicLabelingRule,
})
export const UpdatedRule = m("UpdatedRule", {
  ...repositoryFields,
  generation: S.Int,
  operation: S.Literals(["update", "enable", "disable", "validate"]),
  rule: LabelingRuleManagement.PublicLabelingRule,
})
export const FailedRuleOperation = m("FailedRuleOperation", {
  ...repositoryFields,
  generation: S.Int,
  operation: S.Literals([
    "create",
    "update",
    "enable",
    "disable",
    "validate",
    "delete",
  ]),
  ruleId: S.NullOr(LabelingRule.LabelingRuleId),
  message: S.String,
  currentRule: S.NullOr(LabelingRuleManagement.PublicLabelingRule),
})
export const RequestedRuleState = m("RequestedRuleState", {
  ruleId: LabelingRule.LabelingRuleId,
  enabled: S.Boolean,
})
export const RequestedRuleValidation = m("RequestedRuleValidation", {
  ruleId: LabelingRule.LabelingRuleId,
})
export const RequestedRuleDeletion = m("RequestedRuleDeletion", {
  ruleId: LabelingRule.LabelingRuleId,
})
export const CancelledRuleDeletion = m("CancelledRuleDeletion")
export const ConfirmedRuleDeletion = m("ConfirmedRuleDeletion")
export const DeletedRule = m("DeletedRule", {
  ...repositoryFields,
  generation: S.Int,
  ruleId: LabelingRule.LabelingRuleId,
})
export const DismissedNotice = m("DismissedNotice")
export const OpenedAuditHistory = m("OpenedAuditHistory")
export const ClosedAuditHistory = m("ClosedAuditHistory")
export const RetriedAuditHistory = m("RetriedAuditHistory")
export const ChangedAuditRule = m("ChangedAuditRule", {
  ruleId: S.NullOr(LabelingRule.LabelingRuleId),
})
export const ChangedAuditOperation = m("ChangedAuditOperation", {
  operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
})
export const RequestedMoreAuditHistory = m("RequestedMoreAuditHistory")
export const LoadedAuditHistory = m("LoadedAuditHistory", {
  ...repositoryFields,
  generation: S.Int,
  requestId: S.Int,
  ruleId: S.NullOr(LabelingRule.LabelingRuleId),
  operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
  cursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
  entries: S.Array(LabelingRuleManagement.PublicLabelingRuleAuditEntry),
  nextCursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
})
export const FailedToLoadAuditHistory = m("FailedToLoadAuditHistory", {
  ...repositoryFields,
  generation: S.Int,
  requestId: S.Int,
  ruleId: S.NullOr(LabelingRule.LabelingRuleId),
  operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
  cursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
  message: S.String,
})

export const Message = S.Union([
  ChangedRoute,
  LeftRoute,
  RequestedWorkspace,
  LoadedWorkspace,
  FailedToLoadWorkspace,
  ChangedRuleQuery,
  ChangedStatusFilter,
  ClickedCreateRule,
  ClickedEditRule,
  ClosedRuleEditor,
  ChangedDraftLabel,
  ChangedDraftInstructions,
  ChangedDraftMode,
  ChangedDraftExclusiveGroup,
  SubmittedRule,
  UsedLatestRule,
  CreatedRule,
  UpdatedRule,
  FailedRuleOperation,
  RequestedRuleState,
  RequestedRuleValidation,
  RequestedRuleDeletion,
  CancelledRuleDeletion,
  ConfirmedRuleDeletion,
  DeletedRule,
  DismissedNotice,
  OpenedAuditHistory,
  ClosedAuditHistory,
  RetriedAuditHistory,
  ChangedAuditRule,
  ChangedAuditOperation,
  RequestedMoreAuditHistory,
  LoadedAuditHistory,
  FailedToLoadAuditHistory,
])
export type Message = typeof Message.Type
