import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubInstallation from "@slopcop/domain/GitHub/GitHubInstallation"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import type { RepositoryErrorCause } from "@slopcop/infra/Sql/RepositoryError"
import { UnexpectedRowCount } from "@slopcop/infra/Sql/RepositoryError"

export class GitHubRepositoriesRepoError extends Data.TaggedError(
  "GitHubRepositoriesRepoError",
)<{
  readonly operation:
    | "List"
    | "FindByName"
    | "FindByGitHubId"
    | "FindById"
    | "GetRulesRevision"
    | "IncrementRulesRevision"
    | "UpdateEnabled"
    | "ReplaceInstallationRepositories"
  readonly cause: RepositoryErrorCause
}> {}

const GitHubIdRequest = Schema.Struct({
  githubId: GitHubRepository.GitHubRepositoryExternalId,
})

const IncrementRulesRevisionRequest = Schema.Struct({
  id: GitHubRepository.GitHubRepositoryId,
  expectedRevision: Schema.Int,
})

const UpdateEnabledRequest = Schema.Struct({
  ...GitHubRepository.GitHubRepositorySlug.fields,
  enabled: Schema.Boolean,
})

const ReplaceInstallationRepositoriesRequest = Schema.Struct({
  installationId: GitHubRepository.GitHubInstallationId,
  repositories: Schema.Array(GitHubInstallation.DiscoveredRepository),
})

export class GitHubRepositoriesRepo extends Context.Service<
  GitHubRepositoriesRepo,
  {
    readonly list: () => Effect.Effect<
      ReadonlyArray<GitHubRepository.GitHubRepository>,
      GitHubRepositoriesRepoError
    >
    readonly findBySlug: (
      slug: GitHubRepository.GitHubRepositorySlug,
    ) => Effect.Effect<
      Option.Option<GitHubRepository.GitHubRepository>,
      GitHubRepositoriesRepoError
    >
    readonly findByGitHubId: (
      githubId: GitHubRepository.GitHubRepository["githubId"],
    ) => Effect.Effect<
      Option.Option<GitHubRepository.GitHubRepository>,
      GitHubRepositoriesRepoError
    >
    readonly findById: (
      id: GitHubRepository.GitHubRepository["id"],
    ) => Effect.Effect<
      Option.Option<GitHubRepository.GitHubRepository>,
      GitHubRepositoriesRepoError
    >
    readonly getRulesRevision: (
      id: GitHubRepository.GitHubRepository["id"],
    ) => Effect.Effect<number, GitHubRepositoriesRepoError>
    readonly incrementRulesRevision: (
      id: GitHubRepository.GitHubRepository["id"],
      expectedRevision: number,
    ) => Effect.Effect<number, GitHubRepositoriesRepoError>
    readonly updateEnabled: (
      slug: GitHubRepository.GitHubRepositorySlug,
      enabled: boolean,
    ) => Effect.Effect<
      Option.Option<GitHubRepository.GitHubRepository>,
      GitHubRepositoriesRepoError
    >
    readonly replaceInstallationRepositories: (
      installationId: GitHubRepository.GitHubInstallationId,
      repositories: ReadonlyArray<GitHubInstallation.DiscoveredRepository>,
    ) => Effect.Effect<void, GitHubRepositoriesRepoError>
  }
>()("@slopcop/github/repositories/GitHubRepositoriesRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = SqlSchema.findAll({
      Request: Schema.Void,
      Result: GitHubRepository.GitHubRepository,
      execute: () => sql`
        SELECT *
        FROM "github_repositories" AS repositories
        WHERE repositories."deleted_at" IS NULL
          AND EXISTS (
            SELECT 1
            FROM "github_installations" AS installations
            WHERE installations."github_id" = repositories."installation_id"
              AND installations."status" = 'active'
              AND installations."sync_status" = 'ready'
              AND installations."deleted_at" IS NULL
          )
        ORDER BY "owner" ASC, "repo" ASC
      `,
    })

    const findBySlug = SqlSchema.findOneOption({
      Request: GitHubRepository.GitHubRepositorySlug,
      Result: GitHubRepository.GitHubRepository,
      execute: ({ owner, repo }) => sql`
        SELECT *
        FROM "github_repositories"
        WHERE "owner" = ${owner}
          AND "repo" = ${repo}
          AND "deleted_at" IS NULL
          AND EXISTS (
            SELECT 1 FROM "github_installations" AS installations
            WHERE installations."github_id" = "github_repositories"."installation_id"
              AND installations."status" = 'active'
              AND installations."sync_status" = 'ready'
              AND installations."deleted_at" IS NULL
          )
      `,
    })

    const findByGitHubId = SqlSchema.findOneOption({
      Request: GitHubIdRequest,
      Result: GitHubRepository.GitHubRepository,
      execute: ({ githubId }) => sql`
        SELECT *
        FROM "github_repositories"
        WHERE "github_id" = ${githubId}
          AND "deleted_at" IS NULL
          AND EXISTS (
            SELECT 1 FROM "github_installations" AS installations
            WHERE installations."github_id" = "github_repositories"."installation_id"
              AND installations."status" = 'active'
              AND installations."sync_status" = 'ready'
              AND installations."deleted_at" IS NULL
          )
      `,
    })

    const findById = SqlSchema.findOneOption({
      Request: GitHubRepository.GitHubRepositoryId,
      Result: GitHubRepository.GitHubRepository,
      execute: (id) => sql`
        SELECT *
        FROM "github_repositories"
        WHERE "id" = ${id}
          AND "deleted_at" IS NULL
          AND EXISTS (
            SELECT 1 FROM "github_installations" AS installations
            WHERE installations."github_id" = "github_repositories"."installation_id"
              AND installations."status" = 'active'
              AND installations."sync_status" = 'ready'
              AND installations."deleted_at" IS NULL
          )
      `,
    })

    const incrementRulesRevision = SqlSchema.findOneOption({
      Request: IncrementRulesRevisionRequest,
      Result: GitHubRepository.GitHubRepository,
      execute: ({ id, expectedRevision }) => sql`
        UPDATE "github_repositories"
        SET
          "rules_revision" = "rules_revision" + 1,
          "updated_at" = unixepoch() * 1000
        WHERE "id" = ${id}
          AND "rules_revision" = ${expectedRevision}
          AND "deleted_at" IS NULL
        RETURNING *
      `,
    })

    const updateEnabled = SqlSchema.findOneOption({
      Request: UpdateEnabledRequest,
      Result: GitHubRepository.GitHubRepository,
      execute: ({ owner, repo, enabled }) => sql`
        UPDATE "github_repositories"
        SET
          "enabled" = ${enabled},
          "updated_at" = unixepoch() * 1000
        WHERE "owner" = ${owner}
          AND "repo" = ${repo}
          AND "deleted_at" IS NULL
          AND EXISTS (
            SELECT 1 FROM "github_installations" AS installations
            WHERE installations."github_id" = "github_repositories"."installation_id"
              AND installations."status" = 'active'
              AND installations."sync_status" = 'ready'
              AND installations."deleted_at" IS NULL
          )
        RETURNING *
      `,
    })

    const markInstallationRepositoriesDeleted = SqlSchema.void({
      Request: GitHubRepository.GitHubInstallationId,
      execute: (installationId) => sql`
        UPDATE "github_repositories"
        SET
          "deleted_at" = unixepoch() * 1000,
          "updated_at" = unixepoch() * 1000
        WHERE "installation_id" = ${installationId}
          AND "deleted_at" IS NULL
      `,
    })

    const upsertInstallationRepository = SqlSchema.void({
      Request: Schema.Struct({
        installationId: GitHubRepository.GitHubInstallationId,
        repository: GitHubInstallation.DiscoveredRepository,
      }),
      execute: ({ installationId, repository }) => sql`
        INSERT INTO "github_repositories" (
          "id",
          "github_id",
          "owner",
          "repo",
          "is_private",
          "installation_id",
          "enabled",
          "rules_revision"
        ) VALUES (
          lower(hex(randomblob(16))),
          ${repository.githubId},
          ${repository.owner},
          ${repository.repo},
          ${repository.isPrivate},
          ${installationId},
          0,
          0
        )
        ON CONFLICT ("github_id") DO UPDATE SET
          "owner" = excluded."owner",
          "repo" = excluded."repo",
          "is_private" = excluded."is_private",
          "installation_id" = excluded."installation_id",
          "updated_at" = unixepoch() * 1000,
          "deleted_at" = NULL
      `,
    })

    const replaceInstallationRepositories = (
      request: typeof ReplaceInstallationRepositoriesRequest.Type,
    ) =>
      Effect.gen(function* () {
        yield* markInstallationRepositoriesDeleted(request.installationId)
        yield* Effect.forEach(
          request.repositories,
          (repository) =>
            upsertInstallationRepository({
              installationId: request.installationId,
              repository,
            }),
          { discard: true },
        )
      })

    const toGitHubRepositoriesRepoError =
      (operation: GitHubRepositoriesRepoError["operation"]) =>
      (cause: GitHubRepositoriesRepoError | RepositoryErrorCause) =>
        cause._tag === "GitHubRepositoriesRepoError"
          ? cause
          : new GitHubRepositoriesRepoError({ operation, cause })

    const requireRepository =
      (operation: GitHubRepositoriesRepoError["operation"]) =>
      (repository: Option.Option<GitHubRepository.GitHubRepository>) =>
        Option.match(repository, {
          onNone: () =>
            Effect.fail(
              new GitHubRepositoriesRepoError({
                operation,
                cause: new UnexpectedRowCount({ expected: 1, actual: 0 }),
              }),
            ),
          onSome: Effect.succeed,
        })

    return {
      list: () =>
        list(undefined).pipe(
          Effect.mapError(toGitHubRepositoriesRepoError("List")),
        ),
      findBySlug: (slug) =>
        findBySlug(slug).pipe(
          Effect.mapError(toGitHubRepositoriesRepoError("FindByName")),
        ),
      findByGitHubId: (githubId) =>
        findByGitHubId({ githubId }).pipe(
          Effect.mapError(toGitHubRepositoriesRepoError("FindByGitHubId")),
        ),
      findById: (id) =>
        findById(id).pipe(
          Effect.mapError(toGitHubRepositoriesRepoError("FindById")),
        ),
      getRulesRevision: (id) =>
        findById(id).pipe(
          Effect.flatMap(requireRepository("GetRulesRevision")),
          Effect.map((repository) => repository.rulesRevision),
          Effect.mapError(toGitHubRepositoriesRepoError("GetRulesRevision")),
        ),
      incrementRulesRevision: (id, expectedRevision) =>
        incrementRulesRevision({ id, expectedRevision }).pipe(
          Effect.flatMap(requireRepository("IncrementRulesRevision")),
          Effect.map((repository) => repository.rulesRevision),
          Effect.mapError(
            toGitHubRepositoriesRepoError("IncrementRulesRevision"),
          ),
        ),
      updateEnabled: (slug, enabled) =>
        updateEnabled({ ...slug, enabled }).pipe(
          Effect.mapError(toGitHubRepositoriesRepoError("UpdateEnabled")),
        ),
      replaceInstallationRepositories: (installationId, repositories) =>
        replaceInstallationRepositories({
          installationId,
          repositories: [...repositories],
        }).pipe(
          Effect.mapError(
            toGitHubRepositoriesRepoError("ReplaceInstallationRepositories"),
          ),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
