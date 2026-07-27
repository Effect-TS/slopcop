import { Story } from "foldkit"
import { describe, expect, test } from "vite-plus/test"

import { LoadAccessLogout } from "../../../src/layout/dashboard/command.ts"
import { informRouteChanged, init } from "../../../src/layout/dashboard/init.ts"
import {
  ClickedLogout,
  CompletedLoadExternal,
  ToggledSidebar,
} from "../../../src/layout/dashboard/message.ts"
import { update } from "../../../src/layout/dashboard/update.ts"

describe("dashboard update", () => {
  test("signs out through Cloudflare Access", () => {
    const [model] = init()
    Story.story(
      update,
      Story.with(model),
      Story.message(ClickedLogout()),
      Story.Command.expectHas(LoadAccessLogout),
      Story.Command.resolve(LoadAccessLogout, CompletedLoadExternal()),
    )
  })

  test("toggles the sidebar", () => {
    const [model] = init()
    Story.story(
      update,
      Story.with(model),
      Story.message(ToggledSidebar()),
      Story.model((model) => {
        expect(model.isSidebarOpen).toBe(true)
      }),
    )
  })

  test("closes the sidebar when the route changes", () => {
    const [model] = init()
    const [openModel] = update(model, ToggledSidebar())
    const [closedModel, commands] = informRouteChanged(openModel)
    expect(closedModel.isSidebarOpen).toBe(false)
    expect(commands).toHaveLength(0)
  })
})
