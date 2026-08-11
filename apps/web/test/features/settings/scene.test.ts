import * as Scene from "foldkit/scene"
import { describe, it } from "vite-plus/test"
import * as Settings from "../../../src/features/settings.ts"

const repository = {
  owner: "Effect-TS",
  repo: "effect",
  isPrivate: true,
  enabled: true,
} as const

const selectedModel = (): Settings.Model =>
  Settings.update(
    Settings.init(),
    Settings.SelectedRepositoryChanged({ repository }),
  )[0]

const failedModel = (): Settings.Model => {
  const [saving] = Settings.update(selectedModel(), Settings.ToggledEnabled())
  return Settings.update(
    saving,
    Settings.FailedToUpdateRepositoryEnabled({
      requestId: 1,
      repository: { owner: repository.owner, repo: repository.repo },
      message: "Could not update this repository. Use the switch to retry.",
    }),
  )[0]
}

describe("Settings", () => {
  it("renders the persisted setting without preview language", () => {
    Scene.scene(
      { update: Settings.update, view: Settings.view },
      Scene.given(selectedModel()),
      Scene.expect(
        Scene.role("heading", { name: "Repository settings" }),
      ).toExist(),
      Scene.expect(
        Scene.role("heading", { name: "Repository patrol" }),
      ).toExist(),
      Scene.expect(Scene.text("Effect-TS/effect")).toExist(),
      Scene.expect(Scene.text("Preview only")).not.toExist(),
      Scene.expect(
        Scene.role("switch", { name: "Disable patrol for Effect-TS/effect" }),
      ).toHaveAttr("aria-checked", "true"),
    )
  })

  it("shows saving and disables the switch without changing its value", () => {
    Scene.scene(
      { update: Settings.update, view: Settings.view },
      Scene.given(selectedModel()),
      Scene.click(
        Scene.role("switch", { name: "Disable patrol for Effect-TS/effect" }),
      ),
      Scene.expect(Scene.text("Saving...")).toExist(),
      Scene.expect(
        Scene.role("switch", { name: "Disable patrol for Effect-TS/effect" }),
      ).toHaveAttr("aria-checked", "true"),
      Scene.expect(
        Scene.role("switch", { name: "Disable patrol for Effect-TS/effect" }),
      ).toHaveAttr("disabled", "true"),
      Scene.Command.resolve(
        Settings.UpdateRepositoryEnabled,
        Settings.UpdatedRepositoryEnabled({
          requestId: 1,
          repository: { ...repository, enabled: false },
        }),
      ),
    )
  })

  it("shows an actionable failure and retries through the switch", () => {
    Scene.scene(
      { update: Settings.update, view: Settings.view },
      Scene.given(failedModel()),
      Scene.expect(Scene.role("alert")).toContainText(
        "Could not update this repository. Use the switch to retry.",
      ),
      Scene.expect(Scene.text("On")).toExist(),
      Scene.click(
        Scene.role("switch", {
          name: "Retry: Disable patrol for Effect-TS/effect",
        }),
      ),
      Scene.expect(Scene.text("Saving...")).toExist(),
      Scene.Command.resolve(
        Settings.UpdateRepositoryEnabled,
        Settings.FailedToUpdateRepositoryEnabled({
          requestId: 2,
          repository: { owner: repository.owner, repo: repository.repo },
          message: "The retry failed. Use the switch to retry.",
        }),
      ),
    )
  })

  it("handles no selected repository", () => {
    Scene.scene(
      { update: Settings.update, view: Settings.view },
      Scene.given(Settings.init()),
      Scene.expect(
        Scene.role("heading", { name: "Select a repository" }),
      ).toExist(),
      Scene.expect(
        Scene.text(
          "Choose a repository from the sidebar to manage its patrol setting.",
        ),
      ).toExist(),
      Scene.expect(Scene.role("switch")).not.toExist(),
    )
  })
})
