import * as Schema from "effect/Schema"
import { Toast } from "./toast"

export const Model = Schema.Struct({
  state: Schema.Literals(["idle", "queueing", "polling"]),
  previousAttemptAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  previousSuccessAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  toast: Toast.Model,
})
export type Model = typeof Model.Type
