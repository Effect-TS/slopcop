import * as Schema from "effect/Schema"

export const MountStatus = Schema.Literals(["Mounting", "Ready", "Failed"])
export const Model = Schema.Struct({
  id: Schema.String,
  source: Schema.String,
  mountStatus: MountStatus,
  mountError: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type
