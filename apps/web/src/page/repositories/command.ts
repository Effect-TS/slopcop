import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Effect, Schema as S } from "effect"
import { Command, Http } from "foldkit"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

import {
  FailedToLoadRepositories,
  FailedToUpdateRepositoryPatrol,
  LoadedRepositories,
  UpdatedRepositoryPatrol,
} from "./message"

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

const updateRepositoryEnabledEffect = (
  owner: string,
  repo: string,
  enabled: boolean,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const url = `/api/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/enabled`
    const request = yield* HttpClientRequest.patch(url).pipe(
      HttpClientRequest.schemaBodyJson(
        RepositoryManagement.UpdateRepositoryEnabledRequest,
      )({ enabled }),
    )
    const response = yield* client.execute(request)
    if (response.status !== 200) {
      return yield* Effect.fail(
        FailedToUpdateRepositoryPatrol({
          owner,
          repo,
          enabled,
          message: `The repository enabled-state update returned HTTP ${response.status}.`,
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

export const UpdateRepositoryEnabled = Command.define(
  "UpdateRepositoryEnabled",
  {
    ...RepositoryManagement.RepositoryPath.fields,
    enabled: S.Boolean,
  },
  UpdatedRepositoryPatrol,
  FailedToUpdateRepositoryPatrol,
)(({ owner, repo, enabled }) =>
  Effect.provide(
    updateRepositoryEnabledEffect(owner, repo, enabled),
    Http.layer,
  ),
)
