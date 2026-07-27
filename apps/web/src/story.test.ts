import { Story } from "foldkit"
import { describe, test } from "vite-plus/test"

import { ClickedLogout, CompletedLoadExternal } from "./message"
import { Model } from "./model"
import { initialDashboardRoute } from "./route"
import { LoadAccessLogout, update } from "./update"

describe("dashboard update", () => {
  test("signs out through Cloudflare Access", () => {
    Story.story(
      update,
      Story.with(Model.make({ route: initialDashboardRoute })),
      Story.message(ClickedLogout()),
      Story.Command.expectHas(LoadAccessLogout),
      Story.Command.resolve(LoadAccessLogout, CompletedLoadExternal()),
    )
  })
})
