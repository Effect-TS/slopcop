import * as Popover from "@foldkit/ui/popover"
import * as Scene from "foldkit/scene"
import * as Story from "foldkit/story"
import { describe, expect, it } from "vite-plus/test"

import * as RepositorySelector from "../../../src/components/repository-selector/index.ts"

const publicRepository = {
  owner: "Effect-TS",
  repo: "effect",
  isPrivate: false,
  enabled: true,
}

const privateRepository = {
  owner: "Effect-TS",
  repo: "secret-project",
  isPrivate: true,
  enabled: false,
}

const acknowledgeAnchor = Scene.Mount.resolve(
  Popover.AnchorPopover,
  Popover.CompletedAnchorPopover(),
)

const acknowledgeBackdrop = Scene.Mount.resolve(
  Popover.PortalPopoverBackdrop,
  Popover.CompletedPortalPopoverBackdrop(),
)

const openModel = (): RepositorySelector.Model => {
  const [model] = RepositorySelector.init()
  const [popover] = Popover.open(model.popover)
  return { ...model, popover }
}

const openLoadedModel = (
  repositories = [publicRepository, privateRepository],
  selected: string | null = "Effect-TS/effect",
): RepositorySelector.Model => ({
  ...openModel(),
  repositories:
    RepositorySelector.RepositoryLoadState.cases.RepositoriesLoaded.make({
      repositories,
    }),
  selected,
})

const commandInput = Scene.selector("#repository-selector-command-input")
const popoverPanel = Scene.selector("#repository-selector-popover-panel")

describe("RepositorySelector", () => {
  it("lets the command input own focus without closing the popover", () => {
    Scene.scene(
      { update: RepositorySelector.update, view: RepositorySelector.view },
      Scene.given(openModel()),
      Scene.expect(commandInput).toExist(),
      Scene.expect(popoverPanel).not.toHaveAttr("tabIndex"),
      Scene.expect(popoverPanel).not.toHaveHandler("blur"),
      acknowledgeAnchor,
      acknowledgeBackdrop,
    )
  })

  it("renders loaded repositories from the model", () => {
    Scene.scene(
      { update: RepositorySelector.update, view: RepositorySelector.view },
      Scene.given(openLoadedModel()),
      Scene.expect(popoverPanel).toContainText("effect"),
      Scene.expect(popoverPanel).toContainText("secret-project"),
      Scene.expect(popoverPanel).toContainText("Enabled"),
      Scene.expect(popoverPanel).toContainText("Disabled"),
      Scene.expect(popoverPanel).toContainText("Private repository"),
      acknowledgeAnchor,
      acknowledgeBackdrop,
    )
  })

  it("renders an empty connected-repositories state", () => {
    Scene.scene(
      { update: RepositorySelector.update, view: RepositorySelector.view },
      Scene.given(openLoadedModel([], null)),
      Scene.expect(popoverPanel).toContainText("No repositories connected"),
      acknowledgeAnchor,
      acknowledgeBackdrop,
    )
  })

  it("renders repository load failures", () => {
    Scene.scene(
      { update: RepositorySelector.update, view: RepositorySelector.view },
      Scene.given({
        ...openModel(),
        repositories:
          RepositorySelector.RepositoryLoadState.cases.RepositoriesFailed.make({
            message: "Could not load repositories. Try again.",
          }),
      }),
      Scene.expect(popoverPanel).toContainText("Could not load repositories"),
      acknowledgeAnchor,
      acknowledgeBackdrop,
    )
  })

  it("reconciles selection after repositories load", () => {
    Story.story(
      RepositorySelector.update,
      Story.given({ ...openModel(), selected: "Effect-TS/missing" }),
      Story.message(
        RepositorySelector.LoadedRepositories({
          repositories: [publicRepository, privateRepository],
        }),
      ),
      Story.model((model) => {
        expect(model.selected).toBe("Effect-TS/effect")
      }),
      Story.Command.expectNone(),
    )
  })
})
