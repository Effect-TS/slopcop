import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"

export const ToggledEnabled = m("ToggledEnabled")
export const UpdatedRepositoryEnabled = m("UpdatedRepositoryEnabled", {
  requestId: Schema.Int,
  repository: RepositoryManagement.RepositorySummary,
})
export type UpdatedRepositoryEnabled = typeof UpdatedRepositoryEnabled.Type

export const FailedToUpdateRepositoryEnabled = m(
  "FailedToUpdateRepositoryEnabled",
  {
    requestId: Schema.Int,
    repository: RepositoryManagement.RepositoryPath,
    message: Schema.NonEmptyString,
  },
)
export type FailedToUpdateRepositoryEnabled =
  typeof FailedToUpdateRepositoryEnabled.Type

export const SelectedRepositoryChanged = m("SelectedRepositoryChanged", {
  repository: Schema.NullOr(RepositoryManagement.RepositorySummary),
})

export const Message = Schema.Union([
  ToggledEnabled,
  UpdatedRepositoryEnabled,
  FailedToUpdateRepositoryEnabled,
  SelectedRepositoryChanged,
])
export type Message = typeof Message.Type
