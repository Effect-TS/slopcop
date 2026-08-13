import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubPullRequest from "@slopcop/domain/GitHub/GitHubPullRequest"
import { GitHubPullRequestsRepo } from "@slopcop/github/repositories/GitHubPullRequestsRepo"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { LabelingRuleTestCandidates } from "../../src/Labeling/LabelingRuleTestCandidates.ts"
const now = DateTime.fromDateUnsafe(new Date("2026-08-08T12:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)("repo-1"),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("123"),
  owner: "effect-ts",
  repo: "effect",
  isPrivate: false,
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("456"),
  enabled: true,
  rulesRevision: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const unavailable = Effect.die("Unexpected test service call")
const layer = (configured: boolean, calls: Array<number>) =>
  LabelingRuleTestCandidates.layerNoDeps.pipe(
    Layer.provide([
      Layer.succeed(GitHubRepositoriesRepo, {
        list: () => unavailable,
        findBySlug: () =>
          Effect.succeed(configured ? Option.some(repository) : Option.none()),
        findByGitHubId: () => unavailable,
        findById: () => unavailable,
        getRulesRevision: () => unavailable,
        incrementRulesRevision: () => unavailable,
        updateEnabled: () => unavailable,
        replaceInstallationRepositories: () => unavailable,
      }),
      Layer.succeed(GitHubPullRequestsRepo, {
        listOpen: (_repository, limit) =>
          Effect.sync(() => {
            calls.push(limit)
            return [
              new GitHubPullRequest.GitHubPullRequestRecord({
                repositoryId: repository.id,
                number: 42,
                state: "open",
                title: "Fix",
                body: null,
                draft: false,
                author: "octocat",
                baseRef: "main",
                headSha: "abc",
                githubCreatedAt: now,
                githubUpdatedAt: now,
                generation: 1,
              }),
            ]
          }),
        findSync: () => unavailable,
        markRefreshing: () => unavailable,
        publishOpen: () => unavailable,
        markNotModified: () => unavailable,
        markFailed: () => unavailable,
      }),
    ]),
  )
describe("LabelingRuleTestCandidates", () => {
  it.effect("lists concise candidates with the requested limit", () => {
    const calls: Array<number> = []
    return Effect.gen(function* () {
      const service = yield* LabelingRuleTestCandidates
      expect(yield* service.list(repository, 25)).toMatchObject([
        { number: 42, author: "octocat" },
      ])
      expect(calls).toEqual([25])
    }).pipe(Effect.provide(layer(true, calls)))
  })
  it.effect("returns typed not configured without calling GitHub", () => {
    const calls: Array<number> = []
    return Effect.gen(function* () {
      const service = yield* LabelingRuleTestCandidates
      expect((yield* Effect.flip(service.list(repository, 25)))._tag).toBe(
        "RepositoryNotConfigured",
      )
      expect(calls).toEqual([])
    }).pipe(Effect.provide(layer(false, calls)))
  })
})
