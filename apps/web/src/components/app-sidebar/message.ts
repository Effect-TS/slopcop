import * as Sidebar from "@slopcop/ui/Sidebar"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"
import * as RepositorySelector from "../repository-selector"
import * as Theme from "../../features/theme"

export const GotRepositorySelectorMessage = m("GotRepositorySelectorMessage", {
  message: RepositorySelector.Message,
})
export type GotRepositorySelectorMessage =
  typeof GotRepositorySelectorMessage.Type

export const GotSidebarMessage = m("GotSidebarMessage", {
  message: Sidebar.Message,
})
export type GotSidebarMessage = typeof GotSidebarMessage.Type

export const GotThemeMessage = m("GotThemeMessage", {
  message: Theme.Message,
})
export type GotThemeMessage = typeof GotThemeMessage.Type

export const Message = Schema.Union([
  GotRepositorySelectorMessage,
  GotSidebarMessage,
  GotThemeMessage,
])
export type Message = typeof Message.Type
