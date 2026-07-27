import { RootApi } from "@slopcop/api/RootApi"
import { RepositoryNotFound } from "@slopcop/api/Repositories/Errors"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import { LabelingAdminMiddlewareLayer } from "../../Labeling/httpapi/Security.ts"
import { Repositories, type RepositoriesError } from "../Repositories.ts"
import type { GitHubRepositoriesRepoError } from "../repositories/GitHubRepositoriesRepo.ts"

const internalFailure = (error: GitHubRepositoriesRepoError) =>
  Effect.logError("Repository operation failed", error).pipe(
    Effect.andThen(Effect.die(error)),
  )

const mapError = (error: RepositoriesError) =>
  error._tag === "RepositoryNotConfigured"
    ? Effect.fail(
        new RepositoryNotFound({
          repository: error.repository,
          message: `${error.repository} is not configured in SlopCop. No patrol setting was changed.`,
        }),
      )
    : internalFailure(error)

export const RepositoriesApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "repositories",
  Effect.fnUntraced(function* (handlers) {
    const repositories = yield* Repositories

    return handlers.handleAll({
      listRepositories: () =>
        repositories.list().pipe(
          Effect.map((items) => ({ repositories: items })),
          Effect.catch(internalFailure),
        ),
      updateRepositoryPatrol: ({ params, payload }) =>
        repositories
          .updatePatrol(params, payload.enabled)
          .pipe(Effect.catch(mapError)),
    })
  }),
).pipe(Layer.provide(LabelingAdminMiddlewareLayer))
