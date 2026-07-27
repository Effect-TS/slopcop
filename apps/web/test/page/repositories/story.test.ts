import { Story } from "foldkit"
import { describe, expect, test } from "vite-plus/test"

import {
  LoadRepositories,
  UpdateRepositoryEnabled,
} from "../../../src/page/repositories/command.ts"
import {
  FailedToUpdateRepositoryPatrol,
  LoadedRepositories,
  RequestedRepositories,
  ToggledRepositoryPatrol,
} from "../../../src/page/repositories/message.ts"
import {
  Model,
  NoPatrolNotice,
  RepositoriesReady,
} from "../../../src/page/repositories/model.ts"
import { update } from "../../../src/page/repositories/update.ts"

const model = Model.make({
  query: "",
  repositories: RepositoriesReady.make({
    repositories: [{ owner: "Effect-TS", repo: "effect", enabled: false }],
    pendingPatrols: [],
  }),
  patrolNotice: NoPatrolNotice.make({}),
})

describe("repositories update", () => {
  test("loads repositories on request", () => {
    Story.story(
      update,
      Story.with(model),
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
      Story.with(model),
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
