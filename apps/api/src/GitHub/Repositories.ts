import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import {
  GitHubRepositoriesRepo,
  type GitHubRepositoriesRepoError,
} from "@slopcop/github/repositories/GitHubRepositoriesRepo"

export type RepositoriesError =
  | GitHubRepositoriesRepoError
  | RepositoryNotConfigured

const summarize = (
  repository: GitHubRepository.GitHubRepository,
): RepositoryManagement.RepositorySummary => ({
  owner: repository.owner,
  repo: repository.repo,
  isPrivate: repository.isPrivate,
  enabled: repository.enabled,
})

export class Repositories extends Context.Service<
  Repositories,
  {
    readonly list: () => Effect.Effect<
      ReadonlyArray<RepositoryManagement.RepositorySummary>,
      GitHubRepositoriesRepoError
    >
    readonly updateEnabled: (
      slug: GitHubRepository.GitHubRepositorySlug,
      enabled: boolean,
    ) => Effect.Effect<
      RepositoryManagement.RepositorySummary,
      RepositoriesError
    >
  }
>()("@slopcop/api-app/GitHub/Repositories", {
  make: Effect.gen(function* () {
    const rows = yield* GitHubRepositoriesRepo

    return {
      list: () =>
        rows
          .list()
          .pipe(Effect.map((repositories) => repositories.map(summarize))),
      updateEnabled: (slug, enabled) =>
        rows.updateEnabled(slug, enabled).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  new RepositoryNotConfigured({
                    repository: `${slug.owner}/${slug.repo}`,
                  }),
                ),
              onSome: (repository) => Effect.succeed(summarize(repository)),
            }),
          ),
        ),
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(GitHubRepositoriesRepo.layer),
  )
}
