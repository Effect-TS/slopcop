import * as GitHubDatasetSync from "@slopcop/domain/GitHub/GitHubDatasetSync"
import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubRepositoryLabel from "@slopcop/domain/GitHub/GitHubRepositoryLabel"
import type { RepositoryErrorCause } from "@slopcop/infra/Sql/RepositoryError"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

export class GitHubRepositoryLabelsRepoError extends Data.TaggedError(
  "GitHubRepositoryLabelsRepoError",
)<{
  readonly operation:
    | "List"
    | "FindSync"
    | "MarkRefreshing"
    | "Publish"
    | "MarkNotModified"
    | "MarkFailed"
  readonly cause: RepositoryErrorCause
}> {}

const SyncUpdate = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  attemptedAt: Schema.DateTimeUtc,
  nextRefreshAt: Schema.DateTimeUtc,
})

const FailureUpdate = Schema.Struct({
  ...SyncUpdate.fields,
  message: Schema.String,
})

export class GitHubRepositoryLabelsRepo extends Context.Service<
  GitHubRepositoryLabelsRepo,
  {
    readonly list: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
    ) => Effect.Effect<
      ReadonlyArray<GitHubLabel.GitHubLabel>,
      GitHubRepositoryLabelsRepoError
    >
    readonly findSync: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
    ) => Effect.Effect<
      Option.Option<GitHubDatasetSync.GitHubRepositoryLabelSync>,
      GitHubRepositoryLabelsRepoError
    >
    readonly markRefreshing: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      attemptedAt: DateTime.Utc,
    ) => Effect.Effect<void, GitHubRepositoryLabelsRepoError>
    readonly publish: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      labels: ReadonlyArray<GitHubLabel.GitHubLabel>,
      etag: string | null,
      lastModified: string | null,
      attemptedAt: DateTime.Utc,
      nextRefreshAt: DateTime.Utc,
    ) => Effect.Effect<void, GitHubRepositoryLabelsRepoError>
    readonly markNotModified: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      attemptedAt: DateTime.Utc,
      nextRefreshAt: DateTime.Utc,
    ) => Effect.Effect<void, GitHubRepositoryLabelsRepoError>
    readonly markFailed: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      attemptedAt: DateTime.Utc,
      nextRefreshAt: DateTime.Utc,
      message: string,
    ) => Effect.Effect<void, GitHubRepositoryLabelsRepoError>
  }
>()("@slopcop/github/repositories/GitHubRepositoryLabelsRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const listRows = SqlSchema.findAll({
      Request: GitHubRepository.GitHubRepositoryId,
      Result: GitHubRepositoryLabel.GitHubRepositoryLabel,
      execute: (repositoryId) => sql`
        SELECT labels.* FROM "github_repository_labels" AS labels
        INNER JOIN "github_repository_label_syncs" AS syncs
          ON syncs."repository_id" = labels."repository_id"
          AND syncs."active_generation" = labels."generation"
        WHERE labels."repository_id" = ${repositoryId}
        ORDER BY "name" COLLATE NOCASE, "name"
      `,
    })
    const findSync = SqlSchema.findOneOption({
      Request: GitHubRepository.GitHubRepositoryId,
      Result: GitHubDatasetSync.GitHubRepositoryLabelSync,
      execute: (repositoryId) => sql`
        SELECT * FROM "github_repository_label_syncs"
        WHERE "repository_id" = ${repositoryId}
      `,
    })
    const markRefreshing = SqlSchema.void({
      Request: Schema.Struct({
        repositoryId: GitHubRepository.GitHubRepositoryId,
        attemptedAt: Schema.DateTimeUtc,
      }),
      execute: ({ repositoryId, attemptedAt }) => sql`
        INSERT INTO "github_repository_label_syncs" (
          "repository_id", "status", "last_attempt_at", "next_refresh_at"
        ) VALUES (${repositoryId}, 'refreshing', ${DateTime.toEpochMillis(attemptedAt)}, ${DateTime.toEpochMillis(attemptedAt)})
        ON CONFLICT ("repository_id") DO UPDATE SET
          "status" = 'refreshing',
          "last_attempt_at" = excluded."last_attempt_at",
          "last_error" = NULL
      `,
    })
    const markNotModified = SqlSchema.void({
      Request: SyncUpdate,
      execute: ({ repositoryId, attemptedAt, nextRefreshAt }) => sql`
        UPDATE "github_repository_label_syncs" SET
          "status" = 'ready',
          "last_attempt_at" = ${DateTime.toEpochMillis(attemptedAt)},
          "last_success_at" = ${DateTime.toEpochMillis(attemptedAt)},
          "next_refresh_at" = ${DateTime.toEpochMillis(nextRefreshAt)},
          "consecutive_failures" = 0,
          "last_error" = NULL
        WHERE "repository_id" = ${repositoryId}
      `,
    })
    const markFailed = SqlSchema.void({
      Request: FailureUpdate,
      execute: ({ repositoryId, attemptedAt, nextRefreshAt, message }) => sql`
        UPDATE "github_repository_label_syncs" SET
          "status" = 'failed',
          "last_attempt_at" = ${DateTime.toEpochMillis(attemptedAt)},
          "next_refresh_at" = ${DateTime.toEpochMillis(nextRefreshAt)},
          "consecutive_failures" = "consecutive_failures" + 1,
          "last_error" = ${message}
        WHERE "repository_id" = ${repositoryId}
      `,
    })

    const mapError =
      (operation: GitHubRepositoryLabelsRepoError["operation"]) =>
      (cause: RepositoryErrorCause) =>
        new GitHubRepositoryLabelsRepoError({ operation, cause })

    return {
      list: (repositoryId) =>
        listRows(repositoryId).pipe(
          Effect.map((rows) =>
            rows.map(({ name, description, color }) => ({
              name,
              description,
              color,
            })),
          ),
          Effect.mapError(mapError("List")),
        ),
      findSync: (repositoryId) =>
        findSync(repositoryId).pipe(Effect.mapError(mapError("FindSync"))),
      markRefreshing: (repositoryId, attemptedAt) =>
        markRefreshing({ repositoryId, attemptedAt }).pipe(
          Effect.mapError(mapError("MarkRefreshing")),
        ),
      publish: (
        repositoryId,
        labels,
        etag,
        lastModified,
        attemptedAt,
        nextRefreshAt,
      ) =>
        Effect.gen(function* () {
          const generation = DateTime.toEpochMillis(attemptedAt)
          yield* Effect.forEach(
            labels,
            (label) => sql`
            INSERT INTO "github_repository_labels" (
              "repository_id", "name", "description", "color", "generation"
            ) VALUES (${repositoryId}, ${label.name}, ${label.description}, ${label.color}, ${generation})
          `,
            { discard: true },
          )
          yield* sql`
            INSERT INTO "github_repository_label_syncs" (
              "repository_id", "status", "etag", "last_modified", "last_attempt_at",
              "last_success_at", "next_refresh_at", "consecutive_failures", "last_error",
              "active_generation"
            ) VALUES (${repositoryId}, 'ready', ${etag}, ${lastModified}, ${generation}, ${generation}, ${DateTime.toEpochMillis(nextRefreshAt)}, 0, NULL, ${generation})
            ON CONFLICT ("repository_id") DO UPDATE SET
              "status" = 'ready', "etag" = excluded."etag", "last_modified" = excluded."last_modified",
              "last_attempt_at" = excluded."last_attempt_at", "last_success_at" = excluded."last_success_at",
              "next_refresh_at" = excluded."next_refresh_at", "consecutive_failures" = 0,
              "last_error" = NULL, "active_generation" = excluded."active_generation"
          `
          yield* sql`
            DELETE FROM "github_repository_labels"
            WHERE "repository_id" = ${repositoryId} AND "generation" <> ${generation}
          `
        }).pipe(Effect.mapError(mapError("Publish"))),
      markNotModified: (repositoryId, attemptedAt, nextRefreshAt) =>
        markNotModified({ repositoryId, attemptedAt, nextRefreshAt }).pipe(
          Effect.mapError(mapError("MarkNotModified")),
        ),
      markFailed: (repositoryId, attemptedAt, nextRefreshAt, message) =>
        markFailed({ repositoryId, attemptedAt, nextRefreshAt, message }).pipe(
          Effect.mapError(mapError("MarkFailed")),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
