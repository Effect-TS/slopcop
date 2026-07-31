import { Match as M, Schema as S } from "effect"
import * as Command from "foldkit/command"
import { type ChildAttribute, type Html, childAttributes } from "foldkit/html"
import { m } from "foldkit/message"
import { evo } from "foldkit/struct"
import { defineView } from "foldkit/submodel"

import { Dialog } from "@foldkit/ui"

// MODEL

export const Mode = S.Literals(["Desktop", "Mobile"])
export type Mode = typeof Mode.Type

export const DesktopState = S.Literals(["Expanded", "Collapsed"])
export type DesktopState = typeof DesktopState.Type

export const Model = S.Struct({
  mode: Mode,
  desktopState: DesktopState,
  dialog: Dialog.Model,
})
export type Model = typeof Model.Type

// MESSAGE

export const RequestedOpen = m("RequestedOpen")
export const RequestedClose = m("RequestedClose")
export const ChangedMode = m("ChangedMode", { mode: Mode })
export const GotDialogMessage = m("GotDialogMessage", {
  message: Dialog.Message,
})

export const Message = S.Union([
  RequestedOpen,
  RequestedClose,
  ChangedMode,
  GotDialogMessage,
])
export type Message = typeof Message.Type

// INIT

export type InitConfig = Readonly<{
  /** Stable DOM id. Override the default when rendering multiple sidebars. */
  id?: string
  mode?: Mode
}>

export const init = (config: InitConfig = {}): Model => ({
  mode: config.mode ?? "Desktop",
  desktopState: "Expanded",
  dialog: Dialog.init({
    id: config.id ?? "sidebar",
    isAnimated: true,
  }),
})

// UPDATE

export type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

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

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
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

// VIEW

type SharedRenderInfo = Readonly<{
  layout: ReadonlyArray<ChildAttribute>
  button: ReadonlyArray<ChildAttribute>
}>

export type DesktopRenderInfo = SharedRenderInfo &
  Readonly<{
    _tag: "Desktop"
    desktopState: DesktopState
    panel: ReadonlyArray<ChildAttribute>
  }>

export type MobileRenderInfo = SharedRenderInfo &
  Dialog.RenderInfo &
  Readonly<{
    _tag: "Mobile"
  }>

export type RenderInfo = DesktopRenderInfo | MobileRenderInfo

export type ViewInputs = Readonly<{
  toView: (render: RenderInfo) => Html
}>

export const view = defineView<Model, Message, ViewInputs>(
  (model, { toView }, h): Html => {
    const isExpanded =
      model.mode === "Desktop"
        ? model.desktopState === "Expanded"
        : model.dialog.isOpen
    const modeAttributes = [
      h.DataAttribute(model.mode === "Desktop" ? "desktop" : "mobile", ""),
    ]
    const stateAttributes = [
      h.DataAttribute(isExpanded ? "expanded" : "collapsed", ""),
    ]
    const layout = childAttributes([...modeAttributes, ...stateAttributes])
    const button = childAttributes([
      h.AriaControls(model.dialog.id),
      h.AriaExpanded(isExpanded),
      ...modeAttributes,
      ...stateAttributes,
      h.OnClick(isExpanded ? RequestedClose() : RequestedOpen()),
    ])

    if (model.mode === "Desktop") {
      return toView({
        _tag: "Desktop",
        desktopState: model.desktopState,
        layout,
        button,
        panel: childAttributes([
          h.Id(model.dialog.id),
          ...modeAttributes,
          ...stateAttributes,
        ]),
      })
    }

    return h.submodel({
      slotId: model.dialog.id,
      model: model.dialog,
      view: Dialog.view,
      viewInputs: {
        toView: (dialogRender) =>
          toView({
            _tag: "Mobile",
            layout,
            button,
            ...dialogRender,
            panel: [
              ...dialogRender.panel,
              ...childAttributes([...modeAttributes, ...stateAttributes]),
            ],
          }),
      },
      toParentMessage: (message) => GotDialogMessage({ message }),
    })
  },
)
