import { Match as M } from "effect"
import type { HtmlBuilder } from "foldkit/html"
import * as Scene from "foldkit/scene"
import { describe, it } from "vite-plus/test"

import { Dialog } from "@foldkit/ui"

import { Sidebar } from "../src/index.ts"

const initWithoutAnimation = (
  config: Sidebar.InitConfig = {},
): Sidebar.Model => {
  const model = Sidebar.init(config)
  return {
    ...model,
    dialog: Dialog.init({ id: model.dialog.id }),
  }
}

const sceneView = (model: Sidebar.Model, h: HtmlBuilder<Sidebar.Message>) =>
  Sidebar.view(
    model,
    {
      toView: (render) =>
        M.value(render).pipe(
          M.tagsExhaustive({
            Desktop: ({ layout, button, panel }) =>
              h.keyed("div")(
                "layout",
                [...layout],
                [
                  h.keyed("button")("button", [...button], ["Toggle"]),
                  h.aside([...panel], ["Navigation"]),
                ],
              ),
            Mobile: ({
              layout,
              button,
              dialog,
              backdrop,
              panel,
              title,
              description,
              initialFocus,
              closeButton,
              isVisible,
            }) =>
              h.keyed("div")(
                "layout",
                [...layout],
                [
                  h.keyed("button")("button", [...button], ["Open"]),
                  h.dialog(
                    [...dialog],
                    [
                      ...(isVisible
                        ? [
                            h.div([...backdrop], []),
                            h.aside(
                              [...panel],
                              [
                                h.h2([...title], ["Navigation"]),
                                h.p([...description], ["Primary navigation"]),
                                h.button(
                                  [...closeButton, ...initialFocus],
                                  ["Close"],
                                ),
                              ],
                            ),
                          ]
                        : []),
                    ],
                  ),
                ],
              ),
          }),
        ),
    },
    h,
  )

const layout = Scene.selector('[key="layout"]')
const button = Scene.selector('[key="button"]')
const dialog = Scene.selector("dialog")
const panel = Scene.selector("aside")
const closeButton = Scene.selector("aside button")

describe("Sidebar view", () => {
  it("publishes expanded desktop layout, button, and panel attributes", () => {
    Scene.scene(
      { update: Sidebar.update, view: sceneView },
      Scene.given(Sidebar.init({ id: "navigation" })),
      Scene.expect(layout).toHaveAttr("data-desktop", ""),
      Scene.expect(layout).toHaveAttr("data-expanded", ""),
      Scene.expect(layout).not.toHaveAttr("data-mobile"),
      Scene.expect(button).toHaveAttr("aria-expanded", "true"),
      Scene.expect(button).toHaveAttr("aria-controls", "navigation"),
      Scene.expect(panel).toHaveAttr("id", "navigation"),
      Scene.expect(panel).toHaveAttr("data-desktop", ""),
      Scene.expect(panel).toHaveAttr("data-expanded", ""),
    )
  })

  it("collapses the desktop panel through the published button", () => {
    Scene.scene(
      { update: Sidebar.update, view: sceneView },
      Scene.given(Sidebar.init()),
      Scene.click(button),
      Scene.expect(layout).toHaveAttr("data-collapsed", ""),
      Scene.expect(layout).not.toHaveAttr("data-expanded"),
      Scene.expect(button).toHaveAttr("aria-expanded", "false"),
      Scene.expect(panel).toExist(),
      Scene.expect(panel).toHaveAttr("data-collapsed", ""),
    )
  })

  it("publishes a closed mobile dialog contract", () => {
    Scene.scene(
      { update: Sidebar.update, view: sceneView },
      Scene.given(Sidebar.init({ id: "navigation", mode: "Mobile" })),
      Scene.expect(layout).toHaveAttr("data-mobile", ""),
      Scene.expect(layout).toHaveAttr("data-collapsed", ""),
      Scene.expect(layout).not.toHaveAttr("data-desktop"),
      Scene.expect(button).toHaveAttr("aria-expanded", "false"),
      Scene.expect(button).toHaveAttr("aria-controls", "navigation"),
      Scene.expect(dialog).toHaveAttr("id", "navigation"),
      Scene.expect(panel).toBeAbsent(),
    )
  })

  it("opens the composed mobile Dialog through the published button", () => {
    Scene.scene(
      { update: Sidebar.update, view: sceneView },
      Scene.given(initWithoutAnimation({ id: "navigation", mode: "Mobile" })),
      Scene.click(button),
      Scene.Command.resolve(Dialog.ShowDialog, Dialog.CompletedShowDialog()),
      Scene.expect(layout).toHaveAttr("data-expanded", ""),
      Scene.expect(button).toHaveAttr("aria-expanded", "true"),
      Scene.expect(dialog).toHaveAttr("data-open", ""),
      Scene.expect(panel).toHaveAttr("id", "navigation-panel"),
      Scene.expect(Scene.selector("h2")).toHaveAttr(
        "id",
        "navigation-dialog-title",
      ),
      Scene.expect(Scene.selector("p")).toHaveAttr(
        "id",
        "navigation-dialog-description",
      ),
    )
  })

  it("closes the mobile Dialog through the forwarded close button", () => {
    Scene.scene(
      { update: Sidebar.update, view: sceneView },
      Scene.given(initWithoutAnimation({ mode: "Mobile" })),
      Scene.click(button),
      Scene.Command.resolve(Dialog.ShowDialog, Dialog.CompletedShowDialog()),
      Scene.expect(closeButton).toHaveAttr(
        "data-foldkit-dialog-initial-focus",
        "",
      ),
      Scene.click(closeButton),
      Scene.expect(layout).toHaveAttr("data-collapsed", ""),
      Scene.Command.resolve(Dialog.CloseDialog, Dialog.CompletedCloseDialog()),
      Scene.expect(panel).toBeAbsent(),
    )
  })

  it("forwards Dialog enter and leave transition attributes", () => {
    const initial = Sidebar.init({ mode: "Mobile" })
    const [entering] = Sidebar.open(initial)
    const openIdle = {
      ...initial,
      dialog: Dialog.init({
        id: initial.dialog.id,
        isOpen: true,
        isAnimated: true,
      }),
    }
    const [leaving] = Sidebar.close(openIdle)

    Scene.scene(
      { update: Sidebar.update, view: sceneView },
      Scene.given(entering),
      Scene.expect(panel).toHaveAttr("data-enter", ""),
      Scene.expect(panel).toHaveAttr("data-transition", ""),
      Scene.expect(panel).toHaveAttr("data-closed", ""),
    )
    Scene.scene(
      { update: Sidebar.update, view: sceneView },
      Scene.given(leaving),
      Scene.expect(panel).toHaveAttr("data-leave", ""),
      Scene.expect(panel).toHaveAttr("data-transition", ""),
    )
  })
})
