import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Match as M } from "effect"
import { type Command } from "foldkit"
import { evo } from "foldkit/struct"

import { LoadRepositories, UpdateRepositoryEnabled } from "./command"
import type { Message } from "./message"
import {
  type Model,
  NoPatrolNotice,
  PatrolUpdateFailed,
  RepositoriesFailed,
  RepositoriesLoading,
  RepositoriesReady,
} from "./model"

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

const repositoryMatches = (
  left: RepositoryManagement.RepositoryPath,
  right: RepositoryManagement.RepositoryPath,
) => left.owner === right.owner && left.repo === right.repo

const removePending = (
  pending: ReadonlyArray<RepositoryManagement.RepositoryPath>,
  repository: RepositoryManagement.RepositoryPath,
) => pending.filter((item) => !repositoryMatches(item, repository))

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ChangedRepositoryQuery: ({ query }) => [
        evo(model, { query: () => query }),
        [],
      ],
      ChangedRoute: () =>
        model.repositories._tag === "NotAsked"
          ? [
              evo(model, {
                repositories: () => RepositoriesLoading.make({}),
              }),
              [LoadRepositories()],
            ]
          : [model, []],
      RequestedRepositories: () => [
        evo(model, {
          repositories: () => RepositoriesLoading.make({}),
          patrolNotice: () => NoPatrolNotice.make({}),
        }),
        [LoadRepositories()],
      ],
      LoadedRepositories: ({ repositories }) => [
        evo(model, {
          repositories: () =>
            RepositoriesReady.make({ repositories, pendingPatrols: [] }),
          patrolNotice: () => NoPatrolNotice.make({}),
        }),
        [],
      ],
      FailedToLoadRepositories: ({ message }) => [
        evo(model, {
          repositories: () => RepositoriesFailed.make({ message }),
        }),
        [],
      ],
      ToggledRepositoryPatrol: ({ owner, repo, enabled }) => {
        if (model.repositories._tag !== "Ready") return [model, []]
        const repository = { owner, repo }
        const isPending = model.repositories.pendingPatrols.some((item) =>
          repositoryMatches(item, repository),
        )
        if (isPending) return [model, []]
        return [
          evo(model, {
            repositories: (state) =>
              state._tag === "Ready"
                ? RepositoriesReady.make({
                    repositories: state.repositories.map((item) =>
                      repositoryMatches(item, repository)
                        ? { ...item, enabled }
                        : item,
                    ),
                    pendingPatrols: [...state.pendingPatrols, repository],
                  })
                : state,
            patrolNotice: () => NoPatrolNotice.make({}),
          }),
          [UpdateRepositoryEnabled({ owner, repo, enabled })],
        ]
      },
      UpdatedRepositoryPatrol: ({ repository }) => [
        evo(model, {
          repositories: (state) =>
            state._tag === "Ready"
              ? RepositoriesReady.make({
                  repositories: state.repositories.map((item) =>
                    repositoryMatches(item, repository) ? repository : item,
                  ),
                  pendingPatrols: removePending(
                    state.pendingPatrols,
                    repository,
                  ),
                })
              : state,
        }),
        [],
      ],
      FailedToUpdateRepositoryPatrol: ({ owner, repo, enabled, message }) => {
        const repository = { owner, repo }
        return [
          evo(model, {
            repositories: (state) =>
              state._tag === "Ready"
                ? RepositoriesReady.make({
                    repositories: state.repositories.map((item) =>
                      repositoryMatches(item, repository)
                        ? { ...item, enabled: !enabled }
                        : item,
                    ),
                    pendingPatrols: removePending(
                      state.pendingPatrols,
                      repository,
                    ),
                  })
                : state,
            patrolNotice: () =>
              PatrolUpdateFailed.make({ repository, message }),
          }),
          [],
        ]
      },
    }),
  )
