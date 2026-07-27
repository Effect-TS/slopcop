import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Schema as S } from "effect"
import { m } from "foldkit/message"

export const ChangedRepositoryQuery = m("ChangedRepositoryQuery", {
  query: S.String,
})
export const ChangedRoute = m("ChangedRoute")
export const RequestedRepositories = m("RequestedRepositories")
export const LoadedRepositories = m("LoadedRepositories", {
  repositories: S.Array(RepositoryManagement.RepositorySummary),
})
export const FailedToLoadRepositories = m("FailedToLoadRepositories", {
  message: S.String,
})
export const ToggledRepositoryPatrol = m("ToggledRepositoryPatrol", {
  ...RepositoryManagement.RepositoryPath.fields,
  enabled: S.Boolean,
})
export const UpdatedRepositoryPatrol = m("UpdatedRepositoryPatrol", {
  repository: RepositoryManagement.RepositorySummary,
})
export const FailedToUpdateRepositoryPatrol = m(
  "FailedToUpdateRepositoryPatrol",
  {
    ...RepositoryManagement.RepositoryPath.fields,
    enabled: S.Boolean,
    message: S.String,
  },
)

export const Message = S.Union([
  ChangedRepositoryQuery,
  ChangedRoute,
  RequestedRepositories,
  LoadedRepositories,
  FailedToLoadRepositories,
  ToggledRepositoryPatrol,
  UpdatedRepositoryPatrol,
  FailedToUpdateRepositoryPatrol,
])
export type Message = typeof Message.Type
