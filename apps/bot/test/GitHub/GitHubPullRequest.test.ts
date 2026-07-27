import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { GitHubClient } from "../../src/GitHub/GitHubClient.ts"
import { GitHubPullRequest } from "../../src/GitHub/GitHubPullRequest.ts"
import { GitHubRepositoriesRepo } from "../../src/GitHub/repositories/GitHubRepositoriesRepo.ts"

const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)(
    "repository-1",
  ),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("123"),
  owner: "effect-ts",
  repo: "effect",
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("456"),
  enabled: true,
  rulesRevision: 0,
  createdAt: DateTime.fromDateUnsafe(new Date("2026-07-23T12:00:00Z")),
  updatedAt: DateTime.fromDateUnsafe(new Date("2026-07-23T12:00:00Z")),
  deletedAt: Option.none(),
})

const disabledRepository = new GitHubRepository.GitHubRepository({
  // oxlint-disable-next-line typescript/no-misused-spread
  ...repository,
  enabled: false,
})

const webhookEvent = (installationId = 456, fullName = "effect-ts/effect") => {
  const event = Schema.decodeUnknownSync(GitHubWebhookEvent.GitHubWebhookEvent)(
    {
      id: "delivery-1",
      name: "pull_request",
      payload: {
        action: "opened",
        number: 42,
        pull_request: {
          id: 1,
          node_id: "PR_1",
          title: "Fix behavior",
          body: null,
          draft: false,
          user: { login: "octocat" },
          head: { sha: "abc123" },
          base: { ref: "main" },
        },
        repository: { id: 123, full_name: fullName },
        installation: { id: installationId },
      },
    },
  )
  if (event.name !== "pull_request") throw new Error("Expected pull request")
  return event
}

const unavailable = Effect.die("Unexpected GitHub client call")
const unavailableStream = Stream.die("Unexpected GitHub client call")

const makeLayer = (result: Option.Option<GitHubRepository.GitHubRepository>) =>
  GitHubPullRequest.layerNoDeps.pipe(
    Layer.provide([
      Layer.succeed(GitHubRepositoriesRepo, {
        list: () => Effect.die("Unexpected repository listing"),
        findBySlug: () => Effect.die("Expected lookup by GitHub ID"),
        findByGitHubId: () => Effect.succeed(result),
        findById: () => Effect.die("Unexpected repository lookup"),
        getRulesRevision: () => Effect.die("Unexpected revision lookup"),
        incrementRulesRevision: () =>
          Effect.die("Unexpected revision increment"),
        updateEnabled: () => Effect.die("Unexpected repository update"),
      }),
      Layer.succeed(GitHubClient, {
        getRepositoryLabel: () => unavailable,
        listRepositoryLabels: () => unavailableStream,
        listPullRequestFiles: () => unavailableStream,
        listItemLabels: () => unavailableStream,
        addItemLabels: () => unavailable,
        removeItemLabel: () => unavailable,
      }),
    ]),
  )

describe("GitHubPullRequest.resolveWebhook", () => {
  it.effect("returns an enabled repository matching the webhook identity", () =>
    Effect.gen(function* () {
      const pullRequests = yield* GitHubPullRequest
      const result = yield* pullRequests.resolveWebhook(webhookEvent())
      expect(result.repository).toBe(repository)
      expect(result.number).toBe(42)
      expect(result.headSha).toBe("abc123")
    }).pipe(Effect.provide(makeLayer(Option.some(repository)))),
  )

  it.effect("rejects an unconfigured GitHub repository", () =>
    Effect.gen(function* () {
      const pullRequests = yield* GitHubPullRequest
      const error = yield* Effect.flip(
        pullRequests.resolveWebhook(webhookEvent()),
      )
      expect(error._tag).toBe("RepositoryNotConfigured")
    }).pipe(Effect.provide(makeLayer(Option.none()))),
  )

  it.effect("rejects a disabled GitHub repository", () =>
    Effect.gen(function* () {
      const pullRequests = yield* GitHubPullRequest
      const error = yield* Effect.flip(
        pullRequests.resolveWebhook(webhookEvent()),
      )
      expect(error._tag).toBe("RepositoryNotConfigured")
    }).pipe(Effect.provide(makeLayer(Option.some(disabledRepository)))),
  )

  it.effect("rejects a webhook from a different installation", () =>
    Effect.gen(function* () {
      const pullRequests = yield* GitHubPullRequest
      const error = yield* Effect.flip(
        pullRequests.resolveWebhook(webhookEvent(789)),
      )
      expect(error).toMatchObject({
        _tag: "RepositoryInstallationMismatch",
        expectedInstallationId: "456",
        actualInstallationId: "789",
      })
    }).pipe(Effect.provide(makeLayer(Option.some(repository)))),
  )

  it.effect("rejects a webhook with a stale repository slug", () =>
    Effect.gen(function* () {
      const pullRequests = yield* GitHubPullRequest
      const error = yield* Effect.flip(
        pullRequests.resolveWebhook(webhookEvent(456, "effect-ts/renamed")),
      )
      expect(error).toMatchObject({
        _tag: "RepositorySlugMismatch",
        expected: { owner: "effect-ts", repo: "effect" },
        actual: { owner: "effect-ts", repo: "renamed" },
      })
    }).pipe(Effect.provide(makeLayer(Option.some(repository)))),
  )
})
