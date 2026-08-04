import * as Menu from "@foldkit/ui/menu"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"
import { Theme, ThemePreference } from "./model"

export const CompletedApplyTheme = m("CompletedApplyTheme")
export type CompletedApplyTheme = typeof CompletedApplyTheme.Type

export const CompletedSaveThemePreference = m("CompletedSaveThemePreference")
export type CompletedSaveThemePreference =
  typeof CompletedSaveThemePreference.Type

export const SelectedThemePreference = m("SelectedThemePreference", {
  preference: ThemePreference,
})
export type SelectedThemePreference = typeof SelectedThemePreference.Type

export const ChangedSystemTheme = m("ChangedSystemTheme", {
  theme: Theme,
})
export type ChangedSystemTheme = typeof ChangedSystemTheme.Type

export const GotThemeMenuMessage = m("GotThemeMenuMessage", {
  message: Menu.Message,
})

export const Message = Schema.Union([
  ChangedSystemTheme,
  CompletedApplyTheme,
  CompletedSaveThemePreference,
  SelectedThemePreference,
  GotThemeMenuMessage,
])
export type Message = typeof Message.Type
