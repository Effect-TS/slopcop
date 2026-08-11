import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
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
const unavailableStream = Stream.die("Unexpected test stream call")
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
      Layer.succeed(GitHubClient, {
        getRepositoryLabel: () => unavailable,
        listRepositoryLabels: () => unavailableStream,
        listPullRequestFiles: () => unavailableStream,
        listOpenPullRequests: (_repository, limit) =>
          Effect.sync(() => {
            calls.push(limit)
            return [
              {
                number: 42,
                title: "Fix",
                draft: false,
                author: "octocat",
                updatedAt: now,
              },
            ]
          }),
        getPullRequest: () => unavailable,
        listItemLabels: () => unavailableStream,
        addItemLabels: () => unavailable,
        removeItemLabel: () => unavailable,
        listPullRequestsForCommit: () => unavailable,
        listPullRequestReviews: () => unavailable,
        getFileContent: () => unavailable,
        listRequiredChecks: () => unavailable,
        listCheckRuns: () => unavailable,
        listCommitStatuses: () => unavailable,
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
