import { Scene } from "foldkit"
import { describe, test } from "vite-plus/test"

import { Model } from "./model"
import { initialDashboardRoute } from "./route"
import { update } from "./update"
import { view } from "./view"

describe("dashboard", () => {
  test("renders the Access-authenticated dashboard", () => {
    Scene.scene(
      { update, view },
      Scene.with(Model.make({ route: initialDashboardRoute })),
      Scene.expect(
        Scene.role("heading", {
          name: "Repository automation, under control.",
        }),
      ).toExist(),
      Scene.expect(Scene.text("Access verified / Effectful-Tech")).toExist(),
      Scene.expect(Scene.role("button", { name: "Sign out" })).toExist(),
    )
  })
})
