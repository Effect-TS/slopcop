import * as Menu from "@foldkit/ui/menu"
import * as Schema from "effect/Schema"
import type { Flags } from "./flags"

export const ThemePreference = Schema.Literals(["Light", "Dark", "System"])
export type ThemePreference = typeof ThemePreference.Type

export const Theme = Schema.Literals(["Light", "Dark"])
export type Theme = typeof Theme.Type

export const ThemeMenu: ReturnType<typeof Menu.create<ThemePreference>> =
  Menu.create<ThemePreference>()

export const Model = Schema.Struct({
  menu: Menu.Model,
  preferredTheme: ThemePreference,
  systemTheme: Theme,
  resolvedTheme: Theme,
})
export type Model = typeof Model.Type

export const resolveTheme = ({ preferredTheme, systemTheme }: Flags): Theme =>
  preferredTheme === "System" ? systemTheme : preferredTheme
