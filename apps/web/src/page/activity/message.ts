import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Schema as S } from "effect"
import { m } from "foldkit/message"

export const ChangedRoute = m("ChangedRoute")
export const RequestedActivity = m("RequestedActivity")
export const ChangedActivityRepository = m("ChangedActivityRepository", {
  repository: S.NullOr(S.String),
})
export const ChangedActivityOperation = m("ChangedActivityOperation", {
  operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
})
export const RequestedMoreActivity = m("RequestedMoreActivity")
export const LoadedActivity = m("LoadedActivity", {
  requestId: S.Int,
  repository: S.NullOr(S.String),
  operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
  cursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
  entries: S.Array(LabelingRuleManagement.PublicLabelingRuleActivityEntry),
  repositories: S.Array(RepositoryManagement.RepositoryPath),
  nextCursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
})
export const FailedToLoadActivity = m("FailedToLoadActivity", {
  requestId: S.Int,
  repository: S.NullOr(S.String),
  operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
  cursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
  message: S.String,
})

export const Message = S.Union([
  ChangedRoute,
  RequestedActivity,
  ChangedActivityRepository,
  ChangedActivityOperation,
  RequestedMoreActivity,
  LoadedActivity,
  FailedToLoadActivity,
])
export type Message = typeof Message.Type
