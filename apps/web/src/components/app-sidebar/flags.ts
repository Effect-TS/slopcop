import * as Sidebar from "@slopcop/ui/Sidebar"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Theme from "../../features/theme"
import { MOBILE_VIEWPORT_QUERY } from "./constants"

export const Flags = Schema.Struct({
  mode: Sidebar.Mode,
  theme: Theme.Flags,
})
export type Flags = typeof Flags.Type

export const flags = Effect.gen(function* () {
  const mode: Sidebar.Mode = yield* Effect.sync(() =>
    globalThis.window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
      ? "Mobile"
      : "Desktop",
  )

  const theme = yield* Theme.flags

  return Flags.make({ mode, theme }, { disableChecks: true })
})
