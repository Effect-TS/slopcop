import { Story } from "foldkit"
import { describe, expect, test } from "vite-plus/test"

import {
  ClickedLogout,
  CompletedLoadExternal,
  FailedToUpdateRepositoryPatrol,
  LoadedRepositories,
  RequestedRepositories,
  ToggledRepositoryPatrol,
} from "./message"
import {
  Model,
  NoPatrolNotice,
  RepositoriesNotAsked,
  RepositoriesReady,
} from "./model"
import { RepositoriesRoute, initialDashboardRoute } from "./route"
import {
  LoadAccessLogout,
  LoadRepositories,
  UpdateRepositoryEnabled,
  update,
} from "./update"

const modelWithRepositories = Model.make({
  route: RepositoriesRoute(),
  isSidebarOpen: false,
  repositoryQuery: "",
  repositories: RepositoriesReady.make({
    repositories: [{ owner: "Effect-TS", repo: "effect", enabled: false }],
    pendingPatrols: [],
  }),
  patrolNotice: NoPatrolNotice.make({}),
})

describe("dashboard update", () => {
  test("signs out through Cloudflare Access", () => {
    Story.story(
      update,
      Story.with(
        Model.make({
          route: initialDashboardRoute,
          isSidebarOpen: false,
          repositoryQuery: "",
          repositories: RepositoriesNotAsked.make({}),
          patrolNotice: NoPatrolNotice.make({}),
        }),
      ),
      Story.message(ClickedLogout()),
      Story.Command.expectHas(LoadAccessLogout),
      Story.Command.resolve(LoadAccessLogout, CompletedLoadExternal()),
    )
  })

  test("loads repositories on request", () => {
    Story.story(
      update,
      Story.with(modelWithRepositories),
      Story.message(RequestedRepositories()),
      Story.Command.expectHas(LoadRepositories),
      Story.Command.resolve(
        LoadRepositories,
        LoadedRepositories({
          repositories: [{ owner: "Effect-TS", repo: "effect", enabled: true }],
        }),
      ),
      Story.model((model) => {
        expect(model.repositories._tag).toBe("Ready")
        if (model.repositories._tag === "Ready") {
          expect(model.repositories.repositories[0]?.enabled).toBe(true)
        }
      }),
    )
  })

  test("optimistically updates patrol and rolls back failures", () => {
    Story.story(
      update,
      Story.with(modelWithRepositories),
      Story.message(
        ToggledRepositoryPatrol({
          owner: "Effect-TS",
          repo: "effect",
          enabled: true,
        }),
      ),
      Story.Command.expectHas(UpdateRepositoryEnabled),
      Story.model((model) => {
        expect(model.repositories._tag).toBe("Ready")
        if (model.repositories._tag === "Ready") {
          expect(model.repositories.repositories[0]?.enabled).toBe(true)
          expect(model.repositories.pendingPatrols).toHaveLength(1)
        }
      }),
      Story.Command.resolve(
        UpdateRepositoryEnabled,
        FailedToUpdateRepositoryPatrol({
          owner: "Effect-TS",
          repo: "effect",
          enabled: true,
          message: "Patrol update failed.",
        }),
      ),
      Story.model((model) => {
        expect(model.repositories._tag).toBe("Ready")
        if (model.repositories._tag === "Ready") {
          expect(model.repositories.repositories[0]?.enabled).toBe(false)
          expect(model.repositories.pendingPatrols).toHaveLength(0)
        }
        expect(model.patrolNotice._tag).toBe("PatrolUpdateFailed")
      }),
    )
  })
})
