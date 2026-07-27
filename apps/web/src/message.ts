import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Schema as S } from "effect"
import { m } from "foldkit/message"
import { UrlRequest } from "foldkit/navigation"
import { Url } from "foldkit/url"

export const ChangedUrl = m("ChangedUrl", { url: Url })
export const ClickedLink = m("ClickedLink", { request: UrlRequest })
export const ClickedLogout = m("ClickedLogout")
export const ToggledSidebar = m("ToggledSidebar")
export const ChangedRepositoryQuery = m("ChangedRepositoryQuery", {
  query: S.String,
})
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
export const CompletedNavigateInternal = m("CompletedNavigateInternal")
export const CompletedLoadExternal = m("CompletedLoadExternal")

export const Message = S.Union([
  ChangedUrl,
  ClickedLink,
  ClickedLogout,
  ToggledSidebar,
  ChangedRepositoryQuery,
  RequestedRepositories,
  LoadedRepositories,
  FailedToLoadRepositories,
  ToggledRepositoryPatrol,
  UpdatedRepositoryPatrol,
  FailedToUpdateRepositoryPatrol,
  CompletedNavigateInternal,
  CompletedLoadExternal,
])
export type Message = typeof Message.Type
