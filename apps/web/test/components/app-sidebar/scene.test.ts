import * as Scene from "foldkit/scene"
import { inertHtml as ih } from "foldkit/html"
import { describe, it } from "vite-plus/test"

import * as AppSidebar from "../../../src/components/app-sidebar/index.ts"
import * as RepositorySelector from "../../../src/components/repository-selector/index.ts"

const [model] = AppSidebar.init({
  mode: "Desktop",
  theme: {
    preferredTheme: "System",
    systemTheme: "Light",
  },
})

const sceneView = Scene.withViewInputs(AppSidebar.view, {
  pageTitle: "Auto-Labeling",
  navigationGroups: [
    {
      label: "Patrol",
      items: [
        {
          value: "AutoLabeling",
          label: "Auto-Labeling",
          description: "Label rules",
          icon: ih.span([], ["icon"]),
        },
        {
          value: "Policies",
          label: "Policies",
          description: "Department policies",
          icon: ih.span([], ["icon"]),
        },
      ],
    },
  ],
  toNavigationHref: (value) =>
    value === "Root"
      ? "/"
      : value === "Policies"
        ? "/policies"
        : "/auto-labeling",
  isNavigationItemCurrent: (value) => value === "AutoLabeling",
  toView: () => ih.div([], ["Page content"]),
})

describe("AppSidebar", () => {
  it("renders configured navigation with current-page semantics", () => {
    const sidebar = Scene.selector("aside")
    const navigation = Scene.selector('nav[aria-label="Patrol"]')
    const autoLabelingLink = Scene.selector('a[href="/auto-labeling"]')
    const policiesLink = Scene.selector('a[href="/policies"]')

    Scene.scene(
      { update: AppSidebar.update, view: sceneView() },
      Scene.given(model),
      Scene.expect(sidebar).toHaveClass("text-sidebar-foreground"),
      Scene.expect(sidebar).not.toHaveClass("text-white"),
      Scene.expect(navigation).toContainText("Auto-Labeling"),
      Scene.expect(navigation).toContainText("Policies"),
      Scene.expect(autoLabelingLink).toHaveAttr("aria-current", "page"),
      Scene.expect(autoLabelingLink).toHaveAttr("data-current"),
      Scene.expect(policiesLink).not.toHaveAttr("aria-current", "page"),
    )
  })

  it("renders the selected repository in the header", () => {
    const loadedModel: AppSidebar.Model = {
      ...model,
      repositorySelector: {
        ...model.repositorySelector,
        repositories:
          RepositorySelector.RepositoryLoadState.cases.RepositoriesLoaded.make({
            repositories: [
              {
                owner: "Effect-TS",
                repo: "effect",
                isPrivate: false,
                enabled: true,
              },
              {
                owner: "effect",
                repo: "slopcop",
                isPrivate: false,
                enabled: true,
              },
            ],
          }),
        selected: "Effect-TS/effect",
      },
    }
    const header = Scene.selector("header")

    Scene.scene(
      { update: AppSidebar.update, view: sceneView() },
      Scene.given(loadedModel),
      Scene.expect(header).toContainText("Effect-TS/effect"),
    )

    Scene.scene(
      { update: AppSidebar.update, view: sceneView() },
      Scene.given({
        ...loadedModel,
        repositorySelector: {
          ...loadedModel.repositorySelector,
          selected: "effect/slopcop",
        },
      }),
      Scene.expect(header).toContainText("effect/slopcop"),
    )
  })

  it("shows a fallback when no repository is selected", () => {
    Scene.scene(
      { update: AppSidebar.update, view: sceneView() },
      Scene.given(model),
      Scene.expect(Scene.selector("header")).toContainText(
        "No repository selected",
      ),
    )
  })

  it("renders GitHub sync next to the theme control", () => {
    const sync = Scene.role("button", { name: "Synchronize GitHub data" })
    const theme = Scene.role("button", { name: "Theme" })

    Scene.scene(
      { update: AppSidebar.update, view: sceneView() },
      Scene.given(model),
      Scene.expect(sync).not.toBeDisabled(),
      Scene.expect(theme).toBeVisible(),
    )
  })
})
