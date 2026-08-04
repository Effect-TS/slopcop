import * as Schema from "effect/Schema"

export const ActivationTrigger = Schema.Literals(["Keyboard", "Pointer"])
export type ActivationTrigger = typeof ActivationTrigger.Type

export const Model = Schema.Struct({
  id: Schema.String,
  query: Schema.String,
  maybeActiveValue: Schema.Option(Schema.String),
  activationTrigger: ActivationTrigger,
  maybeLastPointerPosition: Schema.Option(
    Schema.Struct({ screenX: Schema.Number, screenY: Schema.Number }),
  ),
  loop: Schema.Boolean,
  vimBindings: Schema.Boolean,
})
export type Model = typeof Model.Type
