import { Schema as S } from "effect"
import { m } from "foldkit/message"
import { UrlRequest } from "foldkit/navigation"
import { Url } from "foldkit/url"

import { Dashboard } from "./layout"
import { Activity, Repositories, RepositoryWorkspace } from "./page"

export const ChangedUrl = m("ChangedUrl", { url: Url })
export const ClickedLink = m("ClickedLink", { request: UrlRequest })
export const GotDashboardMessage = m("GotDashboardMessage", {
  message: Dashboard.Message,
})
export const GotRepositoriesMessage = m("GotRepositoriesMessage", {
  message: Repositories.Message,
})
export const GotRepositoryWorkspaceMessage = m(
  "GotRepositoryWorkspaceMessage",
  { message: RepositoryWorkspace.Message },
)
export const GotActivityMessage = m("GotActivityMessage", {
  message: Activity.Message,
})
export const CompletedNavigateInternal = m("CompletedNavigateInternal")
export const CompletedLoadExternal = m("CompletedLoadExternal")

export const Message = S.Union([
  ChangedUrl,
  ClickedLink,
  GotDashboardMessage,
  GotRepositoriesMessage,
  GotRepositoryWorkspaceMessage,
  GotActivityMessage,
  CompletedNavigateInternal,
  CompletedLoadExternal,
])
export type Message = typeof Message.Type
