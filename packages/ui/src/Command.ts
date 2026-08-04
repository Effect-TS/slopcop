import { Option } from "effect"
import type * as CommandFx from "foldkit/command"
import type { View as SubmodelView } from "foldkit/submodel"

import { init, type InitConfig } from "./Command/init.ts"
import {
  type Message,
  RequestedItemSelection,
  type OutMessage,
} from "./Command/message.ts"
import type { Model } from "./Command/model.ts"
import {
  activate as activateUntyped,
  setQuery as setQueryUntyped,
  update,
} from "./Command/update.ts"
import { view, type ViewInputs } from "./Command/view.ts"

export * from "./Command/filter.ts"
export * from "./Command/init.ts"
export * from "./Command/message.ts"
export * from "./Command/model.ts"
export * from "./Command/update.ts"
export * from "./Command/view.ts"

export type Bundle<Item = string, Value extends string = string> = Readonly<{
  init: (config: InitConfig) => Model
  view: SubmodelView<Model, Message, ViewInputs<Item, Value>>
  update: (
    model: Model,
    message: Message,
  ) => readonly [
    Model,
    ReadonlyArray<CommandFx.Command<Message>>,
    Option.Option<OutMessage<Value>>,
  ]
  setQuery: (
    model: Model,
    query: string,
  ) => readonly [
    Model,
    ReadonlyArray<CommandFx.Command<Message>>,
    Option.Option<OutMessage<Value>>,
  ]
  activate: (
    model: Model,
    value: Value,
    sourceIndex?: number,
  ) => readonly [
    Model,
    ReadonlyArray<CommandFx.Command<Message>>,
    Option.Option<OutMessage<Value>>,
  ]
  select: (
    model: Model,
    value: Value,
  ) => readonly [
    Model,
    ReadonlyArray<CommandFx.Command<Message>>,
    Option.Option<OutMessage<Value>>,
  ]
}>

export const create = <Item = string, Value extends string = string>(): Bundle<
  Item,
  Value
> => {
  type TypedReturn = readonly [
    Model,
    ReadonlyArray<CommandFx.Command<Message>>,
    Option.Option<OutMessage<Value>>,
  ]

  const typedUpdate = update as (model: Model, message: Message) => TypedReturn

  return {
    init,
    view: view<Item, Value>(),
    update: typedUpdate,
    setQuery: (model, query) => setQueryUntyped(model, query) as TypedReturn,
    activate: (model, value, sourceIndex) =>
      activateUntyped(model, value, sourceIndex) as TypedReturn,
    select: (model, value) =>
      typedUpdate(model, RequestedItemSelection({ value })),
  }
}
