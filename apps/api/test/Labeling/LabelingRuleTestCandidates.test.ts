import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
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

const layer = (
  configured: boolean,
  calls: Array<{ readonly repository: string; readonly limit: number }>,
) =>
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
        listOpenPullRequests: (resolved, limit) =>
          Effect.sync(() => {
            calls.push({ repository: resolved.slug, limit })
            return [
              {
                number: 42,
                title: "Fix candidate listing",
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
  it.effect("lists concise candidates for the configured repository", () => {
    const calls: Array<{
      readonly repository: string
      readonly limit: number
    }> = []
    return Effect.gen(function* () {
      const candidates = yield* LabelingRuleTestCandidates
      expect(
        yield* candidates.list(
          { owner: repository.owner, repo: repository.repo },
          25,
        ),
      ).toEqual([
        {
          number: 42,
          title: "Fix candidate listing",
          draft: false,
          author: "octocat",
          updatedAt: now,
        },
      ])
      expect(calls).toEqual([{ repository: "effect-ts/effect", limit: 25 }])
    }).pipe(Effect.provide(layer(true, calls)))
  })

  it.effect("rejects repositories that are not configured", () => {
    const calls: Array<{
      readonly repository: string
      readonly limit: number
    }> = []
    return Effect.gen(function* () {
      const candidates = yield* LabelingRuleTestCandidates
      const error = yield* Effect.flip(
        candidates.list({ owner: repository.owner, repo: repository.repo }, 25),
      )
      expect(error).toMatchObject({
        _tag: "RepositoryNotConfigured",
        repository: "effect-ts/effect",
      })
      expect(calls).toEqual([])
    }).pipe(Effect.provide(layer(false, calls)))
  })
})
