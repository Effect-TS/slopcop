import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Repositories } from "../../src/GitHub/Repositories.ts"
import { GitHubRepositoriesRepo } from "../../src/GitHub/repositories/GitHubRepositoriesRepo.ts"

const now = DateTime.fromDateUnsafe(new Date("2026-07-27T12:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)(
    "repository-1",
  ),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("123"),
  owner: "Effect-TS",
  repo: "effect",
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("456"),
  enabled: true,
  rulesRevision: 2,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})

const layer = (updated: Option.Option<GitHubRepository.GitHubRepository>) =>
  Repositories.layerNoDeps.pipe(
    Layer.provide(
      Layer.succeed(GitHubRepositoriesRepo, {
        list: () => Effect.succeed([repository]),
        findBySlug: () => Effect.die("Unexpected repository lookup"),
        findByGitHubId: () => Effect.die("Unexpected repository lookup"),
        findById: () => Effect.die("Unexpected repository lookup"),
        getRulesRevision: () => Effect.die("Unexpected revision lookup"),
        incrementRulesRevision: () => Effect.die("Unexpected revision update"),
        updateEnabled: () => Effect.succeed(updated),
      }),
    ),
  )

describe("Repositories", () => {
  it.effect("lists browser-safe repository summaries", () =>
    Effect.gen(function* () {
      const repositories = yield* Repositories
      expect(yield* repositories.list()).toEqual([
        { owner: "Effect-TS", repo: "effect", enabled: true },
      ])
    }).pipe(Effect.provide(layer(Option.some(repository)))),
  )

  it.effect("returns the updated patrol state", () =>
    Effect.gen(function* () {
      const repositories = yield* Repositories
      const result = yield* repositories.updatePatrol(
        { owner: repository.owner, repo: repository.repo },
        false,
      )
      expect(result).toEqual({
        owner: "Effect-TS",
        repo: "effect",
        enabled: false,
      })
    }).pipe(
      Effect.provide(
        layer(
          Option.some(
            new GitHubRepository.GitHubRepository({
              id: repository.id,
              githubId: repository.githubId,
              owner: repository.owner,
              repo: repository.repo,
              installationId: repository.installationId,
              enabled: false,
              rulesRevision: repository.rulesRevision,
              createdAt: repository.createdAt,
              updatedAt: repository.updatedAt,
              deletedAt: repository.deletedAt,
            }),
          ),
        ),
      ),
    ),
  )

  it.effect("reports an unconfigured repository without changing state", () =>
    Effect.gen(function* () {
      const repositories = yield* Repositories
      const error = yield* Effect.flip(
        repositories.updatePatrol(
          { owner: "Effect-TS", repo: "missing" },
          true,
        ),
      )
      expect(error).toMatchObject({
        _tag: "RepositoryNotConfigured",
        repository: "Effect-TS/missing",
      })
    }).pipe(Effect.provide(layer(Option.none()))),
  )
})
