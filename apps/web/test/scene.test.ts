import { Scene } from "foldkit"
import { describe, test } from "vite-plus/test"

import { Dashboard } from "../src/layout/index.ts"
import { Model } from "../src/model.ts"
import {
  Activity,
  Repositories,
  RepositoryWorkspace,
} from "../src/page/index.ts"
import { RepositoriesRoute } from "../src/route.ts"
import { update } from "../src/update.ts"
import { view } from "../src/view.ts"

const repositoriesModel = Model.make({
  route: RepositoriesRoute(),
  dashboard: Dashboard.Model.make({ isSidebarOpen: false }),
  repositories: Repositories.Model.make({
    query: "",
    repositories: Repositories.RepositoriesReady.make({
      repositories: [
        { owner: "Effect-TS", repo: "effect", enabled: true },
        { owner: "effectful-tech", repo: "slopcop", enabled: false },
      ],
      pendingPatrols: [],
    }),
    patrolNotice: Repositories.NoPatrolNotice.make({}),
  }),
  repositoryWorkspace: RepositoryWorkspace.WorkspaceInactive.make({
    generation: 0,
  }),
  activity: Activity.Model.make({
    repository: null,
    operation: "all",
    requestId: 0,
    repositories: [],
    loadMoreError: null,
    activity: Activity.ActivityNotAsked.make({}),
  }),
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
