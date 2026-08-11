import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Management from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import {
  GitHubClient,
  type GitHubClientError,
} from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
export class LabelingRuleTestCandidates extends Context.Service<
  LabelingRuleTestCandidates,
  {
    readonly list: (
      slug: GitHubRepository.GitHubRepositorySlug,
      limit: number,
    ) => Effect.Effect<
      ReadonlyArray<Management.RuleTestCandidate>,
      RepositoryNotConfigured | GitHubClientError
    >
  }
>()("@slopcop/api/Labeling/LabelingRuleTestCandidates", {
  make: Effect.gen(function* () {
    const repositories = yield* GitHubRepositoriesRepo
    const github = yield* GitHubClient
    return {
      list: Effect.fn("LabelingRuleTestCandidates.list")(
        function* (slug, limit) {
          const found = yield* repositories
            .findBySlug(slug)
            .pipe(
              Effect.catchTag("GitHubRepositoriesRepoError", (error) =>
                Effect.logError(
                  "Rule candidate repository lookup failed",
                  error,
                ).pipe(Effect.andThen(Effect.die(error))),
              ),
            )
          const repository = yield* Option.match(found, {
            onNone: () =>
              Effect.fail(
                new RepositoryNotConfigured({
                  repository: `${slug.owner}/${slug.repo}`,
                }),
              ),
            onSome: Effect.succeed,
          })
          return yield* github.listOpenPullRequests(repository, limit)
        },
      ),
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([GitHubRepositoriesRepo.layer, GitHubClient.layer]),
  )
}
