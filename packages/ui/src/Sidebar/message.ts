import * as Dialog from "@foldkit/ui/dialog"
import { m } from "foldkit/message"
import * as Schema from "effect/Schema"
import { Mode } from "./model.ts"

export const RequestedOpen = m("RequestedOpen")
export const RequestedClose = m("RequestedClose")
export const ChangedMode = m("ChangedMode", { mode: Mode })
export const GotDialogMessage = m("GotDialogMessage", {
  message: Dialog.Message,
})

export const Message = Schema.Union([
  RequestedOpen,
  RequestedClose,
  ChangedMode,
  GotDialogMessage,
])
export type Message = typeof Message.Type
