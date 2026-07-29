import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Schema as S } from "effect"

export const ActivityNotAsked = S.TaggedStruct("NotAsked", {})
export const ActivityLoading = S.TaggedStruct("Loading", {})
export const ActivityFailed = S.TaggedStruct("Failed", { message: S.String })
export const ActivityReady = S.TaggedStruct("Ready", {
  entries: S.Array(LabelingRuleManagement.PublicLabelingRuleActivityEntry),
  nextCursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
})
export const ActivityLoadingMore = S.TaggedStruct("LoadingMore", {
  entries: S.Array(LabelingRuleManagement.PublicLabelingRuleActivityEntry),
  cursor: LabelingRuleManagement.LabelingRuleAuditCursor,
})
export const ActivityState = S.Union([
  ActivityNotAsked,
  ActivityLoading,
  ActivityFailed,
  ActivityReady,
  ActivityLoadingMore,
])

export const Model = S.Struct({
  repository: S.NullOr(S.String),
  operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
  requestId: S.Int,
  repositories: S.Array(RepositoryManagement.RepositoryPath),
  loadMoreError: S.NullOr(S.String),
  activity: ActivityState,
})
export type Model = typeof Model.Type
