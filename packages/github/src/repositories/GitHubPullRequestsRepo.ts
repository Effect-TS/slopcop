import * as GitHubDatasetSync from "@slopcop/domain/GitHub/GitHubDatasetSync"
import * as GitHubPullRequest from "@slopcop/domain/GitHub/GitHubPullRequest"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
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

export interface GitHubPullRequestInput {
  readonly number: number
  readonly state: GitHubPullRequest.GitHubPullRequestState
  readonly title: string
  readonly body: string | null
  readonly draft: boolean
  readonly author: string | null
  readonly baseRef: string
  readonly headSha: string
  readonly githubCreatedAt: DateTime.Utc
  readonly githubUpdatedAt: DateTime.Utc
}

export class GitHubPullRequestsRepoError extends Data.TaggedError(
  "GitHubPullRequestsRepoError",
)<{
  readonly operation:
    | "ListOpen"
    | "FindSync"
    | "MarkRefreshing"
    | "PublishOpen"
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

export class GitHubPullRequestsRepo extends Context.Service<
  GitHubPullRequestsRepo,
  {
    readonly listOpen: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      limit: number,
    ) => Effect.Effect<
      ReadonlyArray<GitHubPullRequest.GitHubPullRequestRecord>,
      GitHubPullRequestsRepoError
    >
    readonly findSync: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
    ) => Effect.Effect<
      Option.Option<GitHubDatasetSync.GitHubPullRequestSync>,
      GitHubPullRequestsRepoError
    >
    readonly markRefreshing: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      attemptedAt: DateTime.Utc,
    ) => Effect.Effect<void, GitHubPullRequestsRepoError>
    readonly publishOpen: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      pullRequests: ReadonlyArray<GitHubPullRequestInput>,
      etag: string | null,
      lastModified: string | null,
      attemptedAt: DateTime.Utc,
      nextRefreshAt: DateTime.Utc,
    ) => Effect.Effect<void, GitHubPullRequestsRepoError>
    readonly markNotModified: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      attemptedAt: DateTime.Utc,
      nextRefreshAt: DateTime.Utc,
    ) => Effect.Effect<void, GitHubPullRequestsRepoError>
    readonly markFailed: (
      repositoryId: GitHubRepository.GitHubRepositoryId,
      attemptedAt: DateTime.Utc,
      nextRefreshAt: DateTime.Utc,
      message: string,
    ) => Effect.Effect<void, GitHubPullRequestsRepoError>
  }
>()("@slopcop/github/repositories/GitHubPullRequestsRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const listOpenRows = SqlSchema.findAll({
      Request: Schema.Struct({
        repositoryId: GitHubRepository.GitHubRepositoryId,
        limit: Schema.Int,
      }),
      Result: GitHubPullRequest.GitHubPullRequestRecord,
      execute: ({ repositoryId, limit }) => sql`
        SELECT pulls.* FROM "github_pull_requests" AS pulls
        INNER JOIN "github_pull_request_syncs" AS syncs
          ON syncs."repository_id" = pulls."repository_id"
          AND syncs."active_generation" = pulls."generation"
        WHERE pulls."repository_id" = ${repositoryId} AND pulls."state" = 'open'
        ORDER BY "github_updated_at" DESC, "number" DESC
        LIMIT ${limit}
      `,
    })
    const findSync = SqlSchema.findOneOption({
      Request: GitHubRepository.GitHubRepositoryId,
      Result: GitHubDatasetSync.GitHubPullRequestSync,
      execute: (repositoryId) => sql`
        SELECT * FROM "github_pull_request_syncs"
        WHERE "repository_id" = ${repositoryId}
      `,
    })
    const markRefreshing = SqlSchema.void({
      Request: Schema.Struct({
        repositoryId: GitHubRepository.GitHubRepositoryId,
        attemptedAt: Schema.DateTimeUtc,
      }),
      execute: ({ repositoryId, attemptedAt }) => sql`
        INSERT INTO "github_pull_request_syncs" ("repository_id", "status", "last_attempt_at", "next_refresh_at")
        VALUES (${repositoryId}, 'refreshing', ${DateTime.toEpochMillis(attemptedAt)}, ${DateTime.toEpochMillis(attemptedAt)})
        ON CONFLICT ("repository_id") DO UPDATE SET "status" = 'refreshing', "last_attempt_at" = excluded."last_attempt_at", "last_error" = NULL
      `,
    })
    const markNotModified = SqlSchema.void({
      Request: SyncUpdate,
      execute: ({ repositoryId, attemptedAt, nextRefreshAt }) => sql`
        UPDATE "github_pull_request_syncs" SET "status" = 'ready', "last_attempt_at" = ${DateTime.toEpochMillis(attemptedAt)}, "last_success_at" = ${DateTime.toEpochMillis(attemptedAt)}, "next_refresh_at" = ${DateTime.toEpochMillis(nextRefreshAt)}, "consecutive_failures" = 0, "last_error" = NULL WHERE "repository_id" = ${repositoryId}
      `,
    })
    const markFailed = SqlSchema.void({
      Request: FailureUpdate,
      execute: ({ repositoryId, attemptedAt, nextRefreshAt, message }) => sql`
        UPDATE "github_pull_request_syncs" SET "status" = 'failed', "last_attempt_at" = ${DateTime.toEpochMillis(attemptedAt)}, "next_refresh_at" = ${DateTime.toEpochMillis(nextRefreshAt)}, "consecutive_failures" = "consecutive_failures" + 1, "last_error" = ${message} WHERE "repository_id" = ${repositoryId}
      `,
    })
    const mapError =
      (operation: GitHubPullRequestsRepoError["operation"]) =>
      (cause: RepositoryErrorCause) =>
        new GitHubPullRequestsRepoError({ operation, cause })

    return {
      listOpen: (repositoryId, limit) =>
        listOpenRows({ repositoryId, limit }).pipe(
          Effect.mapError(mapError("ListOpen")),
        ),
      findSync: (repositoryId) =>
        findSync(repositoryId).pipe(Effect.mapError(mapError("FindSync"))),
      markRefreshing: (repositoryId, attemptedAt) =>
        markRefreshing({ repositoryId, attemptedAt }).pipe(
          Effect.mapError(mapError("MarkRefreshing")),
        ),
      publishOpen: (
        repositoryId,
        pullRequests,
        etag,
        lastModified,
        attemptedAt,
        nextRefreshAt,
      ) =>
        Effect.gen(function* () {
          const generation = DateTime.toEpochMillis(attemptedAt)
          yield* Effect.forEach(
            pullRequests,
            (pullRequest) => sql`
            INSERT INTO "github_pull_requests" (
              "repository_id", "number", "state", "title", "body", "draft", "author",
              "base_ref", "head_sha", "github_created_at", "github_updated_at", "generation"
            ) VALUES (${repositoryId}, ${pullRequest.number}, ${pullRequest.state}, ${pullRequest.title}, ${pullRequest.body}, ${pullRequest.draft}, ${pullRequest.author}, ${pullRequest.baseRef}, ${pullRequest.headSha}, ${DateTime.toEpochMillis(pullRequest.githubCreatedAt)}, ${DateTime.toEpochMillis(pullRequest.githubUpdatedAt)}, ${generation})
          `,
            { discard: true },
          )
          yield* sql`
            INSERT INTO "github_pull_request_syncs" (
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
            DELETE FROM "github_pull_requests"
            WHERE "repository_id" = ${repositoryId} AND "generation" <> ${generation}
          `
        }).pipe(Effect.mapError(mapError("PublishOpen"))),
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
