import * as UiToast from "@foldkit/ui/toast"
import * as Schema from "effect/Schema"

export const Toast = UiToast.make(
  Schema.Struct({
    message: Schema.String,
  }),
)
