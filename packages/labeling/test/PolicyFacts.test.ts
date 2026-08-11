import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
const now = DateTime.fromDateUnsafe(new Date("2026-08-10T00:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)("repo"),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("1"),
  owner: "o",
  repo: "r",
  isPrivate: false,
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("2"),
  enabled: true,
  rulesRevision: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const summary = {
  number: 1,
  title: "Title",
  body: null,
  draft: false,
  head: { sha: "sha" },
  base: { ref: "main" },
}
const unavailable = Effect.die("Unexpected call")
const unavailableStream = Stream.die("Unexpected stream call")
const layer = (options: { readonly contentCalls: Array<string> }) =>
  PolicyFacts.layerNoDeps.pipe(
    Layer.provide(
      Layer.succeed(GitHubClient, {
        getRepositoryLabel: () => unavailable,
        listRepositoryLabels: () => unavailableStream,
        listPullRequestFiles: () =>
          Stream.fromIterable(
            Array.from({ length: 101 }, (_, index) => ({
              filename: `.changeset/${index}.md`,
              status: "added" as const,
              patch: "x".repeat(5_000),
            })),
          ),
        listOpenPullRequests: () => unavailable,
        getPullRequest: () => unavailable,
        listItemLabels: () => unavailableStream,
        addItemLabels: () => unavailable,
        removeItemLabel: () => unavailable,
        listPullRequestsForCommit: () => unavailable,
        listPullRequestReviews: () =>
          Effect.succeed([
            { id: 5, reviewer: "BOB", state: "PENDING" as const },
            { id: 4, reviewer: "Alice", state: "DISMISSED" as const },
            { id: 1, reviewer: "Alice", state: "CHANGES_REQUESTED" as const },
            { id: 3, reviewer: "Bob", state: "COMMENTED" as const },
            { id: 2, reviewer: "alice", state: "APPROVED" as const },
          ]),
        getFileContent: (_repo, path) =>
          Effect.sync(() => {
            options.contentCalls.push(path)
            return "y".repeat(5_000)
          }),
        listRequiredChecks: () =>
          Effect.succeed([{ context: "test", integrationId: 7 }]),
        listCheckRuns: () =>
          Effect.succeed([
            {
              name: "test",
              status: "completed" as const,
              conclusion: "success" as const,
              appId: 7,
              producer: "github-actions",
            },
          ]),
        listCommitStatuses: () => Effect.succeed([]),
      }),
    ),
  )
describe("PolicyFacts", () => {
  it.effect("caps files and patch/content at configured bounds", () => {
    const contentCalls: Array<string> = []
    return Effect.gen(function* () {
      const service = yield* PolicyFacts
      const result = yield* service.load(
        repository,
        summary,
        new Set([
          "pull_request.changed_files",
          "pull_request.changed_files.content",
        ]),
        new Set(),
      )
      expect(result.changedFiles).toHaveLength(100)
      expect(result.changedFilesComplete).toBe(false)
      expect(result.changedFiles?.[0]?.patch).toHaveLength(4_000)
      expect(result.changedFiles?.[0]?.content).toHaveLength(4_000)
      expect(contentCalls).toHaveLength(100)
    }).pipe(Effect.provide(layer({ contentCalls })))
  })
  it.effect(
    "does not fetch content unless the compiled selector requires it",
    () => {
      const contentCalls: Array<string> = []
      return Effect.gen(function* () {
        const service = yield* PolicyFacts
        yield* service.load(
          repository,
          summary,
          new Set(["pull_request.changed_files"]),
          new Set(),
        )
        expect(contentCalls).toEqual([])
      }).pipe(Effect.provide(layer({ contentCalls })))
    },
  )
  it.effect("normalizes reviewer identity and retains check producers", () => {
    const contentCalls: Array<string> = []
    return Effect.gen(function* () {
      const service = yield* PolicyFacts
      const result = yield* service.load(
        repository,
        summary,
        new Set([
          "pull_request.required_checks",
          "pull_request.latest_reviews",
        ]),
        new Set(),
      )
      expect(result.requiredChecks).toEqual([
        { producer: "slopcop", name: "test", state: "success" },
      ])
      expect(result.latestReviews).toEqual([])
    }).pipe(
      Effect.provide(layer({ contentCalls })),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ GITHUB_APP_ID: 7 }),
      ),
    )
  })
})
