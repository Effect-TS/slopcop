import { m } from "foldkit/message"
import * as Schema from "effect/Schema"
import { ActivationTrigger } from "./model.ts"

const MaybeActiveValue = Schema.Option(Schema.String)

export const UpdatedQuery = m("UpdatedQuery", {
  query: Schema.String,
  maybeActiveValue: MaybeActiveValue,
})

export const ActivatedItem = m("ActivatedItem", {
  value: Schema.String,
  sourceIndex: Schema.Number,
  activationTrigger: ActivationTrigger,
  screenX: Schema.Option(Schema.Number),
  screenY: Schema.Option(Schema.Number),
})

export const DeactivatedItem = m("DeactivatedItem")

export const RequestedItemSelection = m("RequestedItemSelection", {
  value: Schema.String,
})

export const CompletedScrollIntoView = m("CompletedScrollIntoView")

export const Message = Schema.Union([
  UpdatedQuery,
  ActivatedItem,
  DeactivatedItem,
  RequestedItemSelection,
  CompletedScrollIntoView,
])
export type Message = typeof Message.Type

export const Selected = m("Selected", { value: Schema.String })
export type Selected<Value extends string = string> = Readonly<{
  _tag: "Selected"
  value: Value
}>

export const OutMessage = Schema.Union([Selected])
export type OutMessage<Value extends string = string> = Selected<Value>
