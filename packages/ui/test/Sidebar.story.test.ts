import * as Story from "foldkit/story"
import { describe, expect, it } from "vite-plus/test"

import { Dialog } from "@foldkit/ui"

import { Sidebar } from "../src/index.ts"

const initWithoutAnimation = (
  config: Partial<Sidebar.InitConfig> = {},
): Sidebar.Model => {
  const model = Sidebar.init({ id: "sidebar", ...config })
  return {
    ...model,
    dialog: Dialog.init({ id: model.dialog.id }),
  }
}

describe("Sidebar", () => {
  it("defaults to an expanded desktop sidebar", () => {
    const model = Sidebar.init({ id: "sidebar" })

    expect(model.mode).toBe("Desktop")
    expect(model.desktopState).toBe("Expanded")
    expect(model.dialog.id).toBe("sidebar")
    expect(model.dialog.isOpen).toBe(false)
    expect(model.dialog.isAnimated).toBe(true)
  })

  it("opens and closes the current desktop mode", () => {
    Story.story(
      Sidebar.update,
      Story.given(Sidebar.init({ id: "sidebar" })),
      Story.message(Sidebar.RequestedClose()),
      Story.model((model) => {
        expect(model.desktopState).toBe("Collapsed")
      }),
      Story.Command.expectNone(),
      Story.message(Sidebar.RequestedOpen()),
      Story.model((model) => {
        expect(model.desktopState).toBe("Expanded")
      }),
      Story.Command.expectNone(),
    )
  })

  it("opens and closes the current mobile mode through Dialog", () => {
    Story.story(
      Sidebar.update,
      Story.given(initWithoutAnimation({ id: "navigation", mode: "Mobile" })),
      Story.message(Sidebar.RequestedOpen()),
      Story.model((model) => {
        expect(model.dialog.isOpen).toBe(true)
      }),
      Story.Command.expectHas(Dialog.ShowDialog),
      Story.Command.resolve(Dialog.ShowDialog, Dialog.CompletedShowDialog()),
      Story.message(Sidebar.RequestedClose()),
      Story.model((model) => {
        expect(model.dialog.isOpen).toBe(false)
      }),
      Story.Command.resolve(Dialog.CloseDialog, Dialog.CompletedCloseDialog()),
    )
  })

  it("routes Dialog messages back through the mobile submodel", () => {
    Story.story(
      Sidebar.update,
      Story.given(initWithoutAnimation({ mode: "Mobile" })),
      Story.message(
        Sidebar.GotDialogMessage({ message: Dialog.RequestedOpen() }),
      ),
      Story.model((model) => {
        expect(model.dialog.isOpen).toBe(true)
      }),
      Story.Command.expectHas(Dialog.ShowDialog),
      Story.Command.resolve(Dialog.ShowDialog, Dialog.CompletedShowDialog()),
    )
  })

  it("preserves desktop state and closes mobile state across mode changes", () => {
    const [collapsed] = Sidebar.close(Sidebar.init({ id: "sidebar" }))
    const [mobile] = Sidebar.changeMode(collapsed, "Mobile")
    const [openMobile] = Sidebar.open(mobile)

    Story.story(
      Sidebar.update,
      Story.given(openMobile),
      Story.message(Sidebar.ChangedMode({ mode: "Desktop" })),
      Story.model((model) => {
        expect(model.mode).toBe("Desktop")
        expect(model.desktopState).toBe("Collapsed")
        expect(model.dialog.isOpen).toBe(false)
        expect(model.dialog.animation.transitionState).toBe("Idle")
      }),
      Story.Command.resolve(
        Dialog.ReleaseDialogResources,
        Dialog.CompletedReleaseDialogResources(),
      ),
    )
  })

  it("programmatic helpers act on the current mode", () => {
    const [collapsed] = Sidebar.close(Sidebar.init({ id: "desktop" }))
    const [expanded] = Sidebar.open(collapsed)
    const [openMobile] = Sidebar.open(
      Sidebar.init({ id: "mobile", mode: "Mobile" }),
    )
    const [closedMobile] = Sidebar.close(openMobile)

    expect(expanded.desktopState).toBe("Expanded")
    expect(openMobile.dialog.isOpen).toBe(true)
    expect(closedMobile.dialog.isOpen).toBe(false)
  })

  it("changes mode through the programmatic API", () => {
    const [mobile] = Sidebar.changeMode(
      Sidebar.init({ id: "sidebar" }),
      "Mobile",
    )
    const [desktop] = Sidebar.changeMode(mobile, "Desktop")

    expect(mobile.mode).toBe("Mobile")
    expect(desktop.mode).toBe("Desktop")
  })
})
