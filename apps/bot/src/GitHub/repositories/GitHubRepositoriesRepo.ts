import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import type { RepositoryErrorCause } from "../../Sql/RepositoryError.ts"
import { UnexpectedRowCount } from "../../Sql/RepositoryError.ts"

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
  }
>()("@slopcop/bot/GitHub/repositories/GitHubRepositoriesRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = SqlSchema.findAll({
      Request: Schema.Void,
      Result: GitHubRepository.GitHubRepository,
      execute: () => sql`
        SELECT *
        FROM "github_repositories"
        WHERE "deleted_at" IS NULL
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
        RETURNING *
      `,
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
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
