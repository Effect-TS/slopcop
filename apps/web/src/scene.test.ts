import { Scene } from "foldkit"
import { describe, test } from "vite-plus/test"

import { Model, NoPatrolNotice, RepositoriesReady } from "./model"
import { RepositoriesRoute } from "./route"
import { update } from "./update"
import { view } from "./view"

const repositoriesModel = Model.make({
  route: RepositoriesRoute(),
  isSidebarOpen: false,
  repositoryQuery: "",
  repositories: RepositoriesReady.make({
    repositories: [
      { owner: "Effect-TS", repo: "effect", enabled: true },
      { owner: "effectful-tech", repo: "slopcop", enabled: false },
    ],
    pendingPatrols: [],
  }),
  patrolNotice: NoPatrolNotice.make({}),
})

describe("repositories dashboard", () => {
  test("renders the dashboard shell and repositories", () => {
    Scene.scene(
      { update, view },
      Scene.with(repositoriesModel),
      Scene.expect(
        Scene.role("navigation", { name: "Primary navigation" }),
      ).toExist(),
      Scene.expect(Scene.role("heading", { name: "Repositories" })).toExist(),
      Scene.expect(Scene.text("Effect-TS")).toExist(),
      Scene.expect(Scene.text("effectful-tech")).toExist(),
      Scene.expect(Scene.role("button", { name: "Sign out" })).toExist(),
    )
  })

  test("filters repositories", () => {
    Scene.scene(
      { update, view },
      Scene.with(repositoriesModel),
      Scene.type(Scene.label("Search repositories"), "missing"),
      Scene.expect(Scene.text('No repositories match "missing".')).toExist(),
    )
  })

  test("opens the mobile navigation", () => {
    Scene.scene(
      { update, view },
      Scene.with(repositoriesModel),
      Scene.click(Scene.role("button", { name: "Open navigation" })),
      Scene.expect(
        Scene.role("button", { name: "Close navigation" }),
      ).toExist(),
    )
  })
})
