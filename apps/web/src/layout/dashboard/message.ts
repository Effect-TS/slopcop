import { Schema as S } from "effect"
import { m } from "foldkit/message"

export const ClickedLogout = m("ClickedLogout")
export const ToggledSidebar = m("ToggledSidebar")
export const ChangedRoute = m("ChangedRoute")
export const CompletedLoadExternal = m("CompletedLoadExternal")

export const Message = S.Union([
  ClickedLogout,
  ToggledSidebar,
  ChangedRoute,
  CompletedLoadExternal,
])
export type Message = typeof Message.Type
