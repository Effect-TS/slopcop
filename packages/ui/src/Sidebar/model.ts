import * as Dialog from "@foldkit/ui/dialog"
import * as Schema from "effect/Schema"

export const Mode = Schema.Literals(["Desktop", "Mobile"])
export type Mode = typeof Mode.Type

export const DesktopState = Schema.Literals(["Expanded", "Collapsed"])
export type DesktopState = typeof DesktopState.Type

export const Model = Schema.Struct({
  mode: Mode,
  desktopState: DesktopState,
  dialog: Dialog.Model,
})
export type Model = typeof Model.Type
