import * as Schema from "effect/Schema"
import { m } from "foldkit/message"

export const MountedEditor = m("MountedEditor")
export const FailedToMountEditor = m("FailedToMountEditor", {
  reason: Schema.String,
})
export const EditedSource = m("EditedSource", { source: Schema.String })

export const Message = Schema.Union([
  MountedEditor,
  FailedToMountEditor,
  EditedSource,
])
export type Message = typeof Message.Type
