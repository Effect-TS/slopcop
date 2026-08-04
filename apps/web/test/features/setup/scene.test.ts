import * as Scene from "foldkit/scene"
import { describe, expect, it } from "vite-plus/test"

import * as Setup from "../../../src/features/setup.ts"

describe("Setup", () => {
  it("starts a refresh and enters the loading state", () => {
    const [model, commands] = Setup.update(
      Setup.Model.cases.AppNotInstalled.make({
        installationUrl: "https://github.com/apps/slopcop/installations/new",
      }),
      Setup.RequestedSetupRefresh(),
    )

    expect(model._tag).toBe("LoadingSetup")
    expect(commands.map((command) => command.name)).toEqual(["RefreshSetup"])
  })

  it("renders the app installation state", () => {
    Scene.scene(
      { update: Setup.update, view: Setup.view },
      Scene.given(
        Setup.Model.cases.AppNotInstalled.make({
          installationUrl: "https://github.com/apps/slopcop/installations/new",
        }),
      ),
      Scene.expect(Scene.selector("main")).toContainText(
        "Connect Effect repositories",
      ),
      Scene.expect(Scene.selector("main")).toContainText("Check again"),
    )
  })

  it("renders repository selection guidance", () => {
    Scene.scene(
      { update: Setup.update, view: Setup.view },
      Scene.given(
        Setup.Model.cases.NoRepositoriesSelected.make({
          configurationUrl: "https://github.com/settings/installations/1",
        }),
      ),
      Scene.expect(Scene.selector("main")).toContainText(
        "Give SlopCop somewhere to patrol",
      ),
      Scene.expect(Scene.selector("main")).toContainText("Select repositories"),
    )
  })
})
