import * as UiToast from "@foldkit/ui/toast"
import * as Schema from "effect/Schema"

export const Toast = UiToast.make(
  Schema.Struct({
    title: Schema.String,
    detail: Schema.String,
  }),
)
