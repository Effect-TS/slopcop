import { Schema as S } from "effect"
import { m } from "foldkit/message"
import { UrlRequest } from "foldkit/navigation"
import { Url } from "foldkit/url"

export const ChangedUrl = m("ChangedUrl", { url: Url })
export const ClickedLink = m("ClickedLink", { request: UrlRequest })
export const ClickedLogout = m("ClickedLogout")
export const CompletedNavigateInternal = m("CompletedNavigateInternal")
export const CompletedLoadExternal = m("CompletedLoadExternal")

export const Message = S.Union([
  ChangedUrl,
  ClickedLink,
  ClickedLogout,
  CompletedNavigateInternal,
  CompletedLoadExternal,
])
export type Message = typeof Message.Type
