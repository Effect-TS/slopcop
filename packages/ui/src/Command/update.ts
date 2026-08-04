import { Effect, Match, Option } from "effect"
import * as Schema from "effect/Schema"
import * as Command from "foldkit/command"
import * as Dom from "foldkit/dom"
import type { Model } from "./model.ts"
import {
  type Message,
  CompletedScrollIntoView,
  OutMessage,
  Selected,
  ActivatedItem,
  RequestedItemSelection,
  UpdatedQuery,
} from "./message.ts"

export type UpdateReturn<Value extends string = string> = readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
  Option.Option<OutMessage<Value>>,
]

export const itemId = (id: string, sourceIndex: number): string =>
  `${id}-item-${sourceIndex}`

export const inputId = (id: string): string => `${id}-input`
export const listId = (id: string): string => `${id}-list`

const idSelector = (id: string): string => `#${CSS.escape(id)}`

export const itemSelector = (id: string, sourceIndex: number): string =>
  idSelector(itemId(id, sourceIndex))

export const ScrollIntoView = Command.define("ScrollIntoView", {
  args: { id: Schema.String, sourceIndex: Schema.Number },
  messages: [CompletedScrollIntoView],
  execute: ({ id, sourceIndex }) =>
    Dom.scrollIntoView(itemSelector(id, sourceIndex)).pipe(
      Effect.ignore,
      Effect.as(CompletedScrollIntoView()),
    ),
})

const withUpdateReturn = Match.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    withUpdateReturn,
    Match.tag("CompletedScrollIntoView", () => [model, [], Option.none()]),
    Match.tagsExhaustive({
      UpdatedQuery: ({ query, maybeActiveValue }) => [
        {
          ...model,
          query,
          maybeActiveValue,
          activationTrigger: "Keyboard",
          maybeLastPointerPosition: Option.none(),
        },
        [],
        Option.none(),
      ],
      ActivatedItem: ({
        value,
        sourceIndex,
        activationTrigger,
        screenX,
        screenY,
      }) => {
        const isSamePointerPosition =
          activationTrigger === "Pointer" &&
          Option.isSome(screenX) &&
          Option.isSome(screenY) &&
          Option.exists(
            model.maybeLastPointerPosition,
            (position) =>
              position.screenX === screenX.value &&
              position.screenY === screenY.value,
          )

        if (isSamePointerPosition) {
          return [model, [], Option.none()]
        }

        return [
          {
            ...model,
            maybeActiveValue: Option.some(value),
            activationTrigger,
            maybeLastPointerPosition:
              activationTrigger === "Pointer" &&
              Option.isSome(screenX) &&
              Option.isSome(screenY)
                ? Option.some({
                    screenX: screenX.value,
                    screenY: screenY.value,
                  })
                : Option.none(),
          },
          activationTrigger === "Keyboard"
            ? [ScrollIntoView({ id: model.id, sourceIndex })]
            : [],
          Option.none(),
        ]
      },
      DeactivatedItem: () =>
        model.activationTrigger === "Pointer"
          ? [{ ...model, maybeActiveValue: Option.none() }, [], Option.none()]
          : [model, [], Option.none()],
      RequestedItemSelection: ({ value }) => [
        model,
        [],
        Option.some(Selected({ value })),
      ],
    }),
  )

export const setQuery = (model: Model, query: string): UpdateReturn =>
  update(model, UpdatedQuery({ query, maybeActiveValue: Option.none() }))

export const activate = (
  model: Model,
  value: string,
  sourceIndex = 0,
): UpdateReturn =>
  update(
    model,
    ActivatedItem({
      value,
      sourceIndex,
      activationTrigger: "Keyboard",
      screenX: Option.none(),
      screenY: Option.none(),
    }),
  )

export const select = (model: Model, value: string): UpdateReturn =>
  update(model, RequestedItemSelection({ value }))
