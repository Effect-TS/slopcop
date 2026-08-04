import * as Dialog from "@foldkit/ui/dialog"
import { type ChildAttribute, type Html, childAttributes } from "foldkit/html"
import { defineView } from "foldkit/submodel"
import {
  type Message,
  GotDialogMessage,
  RequestedClose,
  RequestedOpen,
} from "./message.ts"
import type { DesktopState, Model } from "./model.ts"

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
