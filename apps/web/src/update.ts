import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Effect, Match as M, Schema as S } from "effect"
import { Command, Http } from "foldkit"
import { load, pushUrl } from "foldkit/navigation"
import { evo } from "foldkit/struct"
import { toString as urlToString } from "foldkit/url"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  FailedToLoadRepositories,
  FailedToUpdateRepositoryPatrol,
  LoadedRepositories,
  type Message,
  UpdatedRepositoryPatrol,
} from "./message"
import {
  type Model,
  NoPatrolNotice,
  PatrolUpdateFailed,
  RepositoriesFailed,
  RepositoriesLoading,
  RepositoriesReady,
} from "./model"
import { urlToAppRoute } from "./route"

const NavigateInternal = Command.define(
  "NavigateInternal",
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

export const LoadAccessLogout = Command.define(
  "LoadAccessLogout",
  CompletedLoadExternal,
)(load("/cdn-cgi/access/logout").pipe(Effect.as(CompletedLoadExternal())))

const LoadExternal = Command.define(
  "LoadExternal",
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

const loadRepositoriesEffect = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.execute(
    HttpClientRequest.get("/api/v1/repositories"),
  )

  if (response.status !== 200) {
    return yield* Effect.fail(
      FailedToLoadRepositories({
        message: `The repository list request returned HTTP ${response.status}.`,
      }),
    )
  }

  const result = yield* S.decodeUnknownEffect(
    RepositoryManagement.ListRepositoriesResponse,
  )(yield* response.json)
  return LoadedRepositories({ repositories: result.repositories })
}).pipe(
  Effect.catchTag("FailedToLoadRepositories", Effect.succeed),
  Effect.catch(() =>
    Effect.succeed(
      FailedToLoadRepositories({
        message: "SlopCop could not load repositories. Try the request again.",
      }),
    ),
  ),
)

export const LoadRepositories = Command.define(
  "LoadRepositories",
  LoadedRepositories,
  FailedToLoadRepositories,
)(Effect.provide(loadRepositoriesEffect, Http.layer))

const updateRepositoryPatrolEffect = (
  owner: string,
  repo: string,
  enabled: boolean,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const url = `/api/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/patrol`
    const request = yield* HttpClientRequest.patch(url).pipe(
      HttpClientRequest.schemaBodyJson(
        RepositoryManagement.UpdateRepositoryPatrolRequest,
      )({ enabled }),
    )
    const response = yield* client.execute(request)

    if (response.status !== 200) {
      return yield* Effect.fail(
        FailedToUpdateRepositoryPatrol({
          owner,
          repo,
          enabled,
          message: `The patrol update returned HTTP ${response.status}.`,
        }),
      )
    }

    const repository = yield* S.decodeUnknownEffect(
      RepositoryManagement.RepositorySummary,
    )(yield* response.json)
    return UpdatedRepositoryPatrol({ repository })
  }).pipe(
    Effect.catchTag("FailedToUpdateRepositoryPatrol", Effect.succeed),
    Effect.catch(() =>
      Effect.succeed(
        FailedToUpdateRepositoryPatrol({
          owner,
          repo,
          enabled,
          message:
            "SlopCop could not update patrol status. The previous setting was restored.",
        }),
      ),
    ),
  )

export const UpdateRepositoryPatrol = Command.define(
  "UpdateRepositoryPatrol",
  {
    ...RepositoryManagement.RepositoryPath.fields,
    enabled: S.Boolean,
  },
  UpdatedRepositoryPatrol,
  FailedToUpdateRepositoryPatrol,
)(({ owner, repo, enabled }) =>
  Effect.provide(
    updateRepositoryPatrolEffect(owner, repo, enabled),
    Http.layer,
  ),
)

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
      ChangedUrl: ({ url }) => {
        const route = urlToAppRoute(url)
        const shouldLoadRepositories =
          route._tag === "Repositories" &&
          model.repositories._tag === "NotAsked"

        return [
          evo(model, {
            route: () => route,
            isSidebarOpen: () => false,
            repositories: (state) =>
              shouldLoadRepositories ? RepositoriesLoading.make({}) : state,
          }),
          shouldLoadRepositories ? [LoadRepositories()] : [],
        ]
      },
      ClickedLink: ({ request }) =>
        M.value(request).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            Internal: ({ url }) => [
              model,
              [NavigateInternal({ url: urlToString(url) })],
            ],
            External: ({ href }) => [model, [LoadExternal({ href })]],
          }),
        ),
      ClickedLogout: () => [model, [LoadAccessLogout()]],
      ToggledSidebar: () => [
        evo(model, { isSidebarOpen: (isOpen) => !isOpen }),
        [],
      ],
      ChangedRepositoryQuery: ({ query }) => [
        evo(model, { repositoryQuery: () => query }),
        [],
      ],
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
          [UpdateRepositoryPatrol({ owner, repo, enabled })],
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
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],
    }),
  )
