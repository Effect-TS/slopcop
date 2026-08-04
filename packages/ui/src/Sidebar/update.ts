import * as Dialog from "@foldkit/ui/dialog"
import * as Match from "effect/Match"
import * as Command from "foldkit/command"
import { evo } from "foldkit/struct"
import {
  type Message,
  ChangedMode,
  GotDialogMessage,
  RequestedOpen,
  RequestedClose,
} from "./message.ts"
import type { Model, Mode } from "./model.ts"

export type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
]

const withUpdateReturn = Match.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    withUpdateReturn,
    Match.tagsExhaustive({
      RequestedOpen: () => openCurrentMode(model),
      RequestedClose: () => closeCurrentMode(model),
      ChangedMode: ({ mode }) => {
        if (mode === model.mode) {
          return [model, []]
        }

        const [dialog, commands] = Dialog.update(
          model.dialog,
          Dialog.Unmounted(),
        )

        return [
          evo(model, {
            mode: () => mode,
            dialog: () => dialog,
          }),
          mapDialogCommands(commands),
        ]
      },
      GotDialogMessage: ({ message: dialogMessage }) =>
        delegateToDialog(model, dialogMessage),
    }),
  )

export const open = (model: Model): UpdateReturn =>
  update(model, RequestedOpen())

export const close = (model: Model): UpdateReturn =>
  update(model, RequestedClose())

export const changeMode = (model: Model, mode: Mode): UpdateReturn =>
  update(model, ChangedMode({ mode }))

const mapDialogCommands = (
  commands: ReadonlyArray<Command.Command<Dialog.Message>>,
): ReadonlyArray<Command.Command<Message>> =>
  Command.mapMessages(commands, (message) => GotDialogMessage({ message }))

const delegateToDialog = (
  model: Model,
  dialogMessage: Dialog.Message,
): UpdateReturn => {
  const [dialog, commands] = Dialog.update(model.dialog, dialogMessage)
  return [evo(model, { dialog: () => dialog }), mapDialogCommands(commands)]
}

const openCurrentMode = (model: Model): UpdateReturn => {
  if (model.mode === "Mobile") {
    const [dialog, commands] = Dialog.open(model.dialog)
    return [evo(model, { dialog: () => dialog }), mapDialogCommands(commands)]
  }

  return [evo(model, { desktopState: () => "Expanded" }), []]
}

const closeCurrentMode = (model: Model): UpdateReturn => {
  if (model.mode === "Mobile") {
    const [dialog, commands] = Dialog.close(model.dialog)
    return [evo(model, { dialog: () => dialog }), mapDialogCommands(commands)]
  }

  return [evo(model, { desktopState: () => "Collapsed" }), []]
}
