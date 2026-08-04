import * as GitHubInstallation from "@slopcop/domain/GitHub/GitHubInstallation"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
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

export class GitHubInstallationsRepoError extends Data.TaggedError(
  "GitHubInstallationsRepoError",
)<{
  readonly operation: "FindActive" | "Upsert" | "SetSyncState" | "Delete"
  readonly cause: RepositoryErrorCause
}> {}

const UpsertInstallation = Schema.Struct({
  githubId: GitHubRepository.GitHubInstallationId,
  accountId: GitHubInstallation.GitHubAccountId,
  accountLogin: Schema.NonEmptyString,
  accountType: GitHubInstallation.GitHubAccountType,
  repositorySelection: GitHubInstallation.GitHubRepositorySelection,
  status: GitHubInstallation.GitHubInstallationStatus,
  syncStatus: GitHubInstallation.GitHubInstallationSyncStatus,
  htmlUrl: Schema.String,
})
type UpsertInstallation = typeof UpsertInstallation.Type

const SetSyncState = Schema.Struct({
  githubId: GitHubRepository.GitHubInstallationId,
  syncStatus: GitHubInstallation.GitHubInstallationSyncStatus,
  lastError: Schema.NullOr(Schema.String),
})

export class GitHubInstallationsRepo extends Context.Service<
  GitHubInstallationsRepo,
  {
    readonly findActive: () => Effect.Effect<
      Option.Option<GitHubInstallation.GitHubInstallation>,
      GitHubInstallationsRepoError
    >
    readonly upsert: (
      installation: UpsertInstallation,
    ) => Effect.Effect<
      GitHubInstallation.GitHubInstallation,
      GitHubInstallationsRepoError
    >
    readonly setSyncState: (
      githubId: GitHubRepository.GitHubInstallationId,
      syncStatus: GitHubInstallation.GitHubInstallationSyncStatus,
      lastError?: string,
    ) => Effect.Effect<void, GitHubInstallationsRepoError>
    readonly delete: (
      githubId: GitHubRepository.GitHubInstallationId,
    ) => Effect.Effect<void, GitHubInstallationsRepoError>
  }
>()("@slopcop/github/repositories/GitHubInstallationsRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const findActive = SqlSchema.findOneOption({
      Request: Schema.Void,
      Result: GitHubInstallation.GitHubInstallation,
      execute: () => sql`
        SELECT *
        FROM "github_installations"
        WHERE "deleted_at" IS NULL
        ORDER BY "created_at" ASC
        LIMIT 1
      `,
    })

    const upsert = SqlSchema.findOneOption({
      Request: UpsertInstallation,
      Result: GitHubInstallation.GitHubInstallation,
      execute: (input) => sql`
        INSERT INTO "github_installations" ${sql.insert(input)}
        ON CONFLICT ("github_id") DO UPDATE SET
          "account_id" = excluded."account_id",
          "account_login" = excluded."account_login",
          "account_type" = excluded."account_type",
          "repository_selection" = excluded."repository_selection",
          "status" = excluded."status",
          "sync_status" = excluded."sync_status",
          "html_url" = excluded."html_url",
          "last_error" = NULL,
          "updated_at" = unixepoch() * 1000,
          "deleted_at" = NULL
        RETURNING *
      `,
    })

    const setSyncState = SqlSchema.void({
      Request: SetSyncState,
      execute: ({ githubId, syncStatus, lastError }) => sql`
        UPDATE "github_installations"
        SET
          "sync_status" = ${syncStatus},
          "last_error" = ${lastError},
          "updated_at" = unixepoch() * 1000
        WHERE "github_id" = ${githubId}
          AND "deleted_at" IS NULL
      `,
    })

    const deleteInstallation = SqlSchema.void({
      Request: GitHubRepository.GitHubInstallationId,
      execute: (githubId) => sql`
        UPDATE "github_installations"
        SET
          "deleted_at" = unixepoch() * 1000,
          "updated_at" = unixepoch() * 1000
        WHERE "github_id" = ${githubId}
          AND "deleted_at" IS NULL
      `,
    })

    const mapError =
      (operation: GitHubInstallationsRepoError["operation"]) =>
      (cause: GitHubInstallationsRepoError | RepositoryErrorCause) =>
        cause._tag === "GitHubInstallationsRepoError"
          ? cause
          : new GitHubInstallationsRepoError({ operation, cause })

    return {
      findActive: () =>
        findActive(undefined).pipe(Effect.mapError(mapError("FindActive"))),
      upsert: (installation) =>
        upsert(installation).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  new GitHubInstallationsRepoError({
                    operation: "Upsert",
                    cause: new UnexpectedRowCount({ expected: 1, actual: 0 }),
                  }),
                ),
              onSome: Effect.succeed,
            }),
          ),
          Effect.mapError(mapError("Upsert")),
        ),
      setSyncState: (githubId, syncStatus, lastError) =>
        setSyncState({
          githubId,
          syncStatus,
          lastError: lastError ?? null,
        }).pipe(Effect.mapError(mapError("SetSyncState"))),
      delete: (githubId) =>
        deleteInstallation(githubId).pipe(Effect.mapError(mapError("Delete"))),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
