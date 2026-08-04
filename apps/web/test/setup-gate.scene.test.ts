import * as Scene from "foldkit/scene"
import { describe, it } from "vite-plus/test"

import * as Main from "../src/main.ts"

const flags: Main.Flags = {
  sidebar: {
    mode: "Desktop",
    theme: {
      preferredTheme: "System",
      systemTheme: "Light",
    },
  },
}

describe("setup gate", () => {
  it("shows setup instead of the app until setup is ready", () => {
    const [model] = Main.init(flags)

    Scene.scene(
      { update: Main.update, view: Main.view },
      Scene.given({
        ...model,
        setup: Main.Model.fields.setup.cases.AppNotInstalled.make({
          installationUrl: "https://github.com/apps/slopcop/installations/new",
        }),
      }),
      Scene.expect(Scene.selector("main")).toContainText(
        "Connect Effect repositories",
      ),
    )
  })
})
