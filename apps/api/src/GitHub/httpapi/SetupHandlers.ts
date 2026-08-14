import { RootApi } from "@slopcop/api/RootApi"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import { GitHubSetup } from "@slopcop/github/GitHubSetup"
import { GitHubDataSyncQueue } from "../GitHubDataSyncQueue.ts"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import * as Schema from "effect/Schema"
import * as Setup from "@slopcop/domain/GitHub/Setup"
import { LabelingAdminMiddlewareLayer } from "../../Labeling/httpapi/Security.ts"

const internalFailure = (operation: string) => (error: unknown) =>
  Effect.logError(`GitHub setup ${operation} failed`, error).pipe(
    Effect.andThen(Effect.die(error)),
  )

export const SetupApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "setup",
  Effect.fnUntraced(function* (handlers) {
    const setup = yield* GitHubSetup
    const queue = yield* GitHubDataSyncQueue
    const sql = yield* SqlClient.SqlClient
    const getDataSyncStatus = SqlSchema.findOne({
      Request: Schema.Void,
      Result: Schema.Struct({
        status: Schema.Literals(["pending", "refreshing", "ready", "failed"]),
        lastAttemptAt: Schema.NullOr(Schema.DateTimeUtcFromMillis),
        lastSuccessAt: Schema.NullOr(Schema.DateTimeUtcFromMillis),
        nextRefreshAt: Schema.NullOr(Schema.DateTimeUtcFromMillis),
        failedDatasets: Schema.Int,
        refreshingDatasets: Schema.Int,
      }),
      execute: () => sql`
        SELECT
          CASE
            WHEN SUM(CASE WHEN "status" = 'refreshing' THEN 1 ELSE 0 END) > 0 THEN 'refreshing'
            WHEN SUM(CASE WHEN "status" = 'failed' THEN 1 ELSE 0 END) > 0 THEN 'failed'
            WHEN COUNT(*) = 0 THEN 'pending'
            ELSE 'ready'
          END AS "status",
          MAX("last_attempt_at") AS "last_attempt_at",
          MAX("last_success_at") AS "last_success_at",
          MIN("next_refresh_at") AS "next_refresh_at",
          COALESCE(SUM(CASE WHEN "status" = 'failed' THEN 1 ELSE 0 END), 0) AS "failed_datasets",
          COALESCE(SUM(CASE WHEN "status" = 'refreshing' THEN 1 ELSE 0 END), 0) AS "refreshing_datasets"
        FROM (
          SELECT "status", "last_attempt_at", "last_success_at", "next_refresh_at" FROM "github_repository_label_syncs"
          UNION ALL
          SELECT "status", "last_attempt_at", "last_success_at", "next_refresh_at" FROM "github_pull_request_syncs"
        )
      `,
    })
    return handlers.handleAll({
      getSetupStatus: () =>
        setup.getStatus().pipe(Effect.catch(internalFailure("status lookup"))),
      refreshSetup: () =>
        setup.refresh().pipe(Effect.catch(internalFailure("refresh"))),
      getGitHubDataSyncStatus: () =>
        getDataSyncStatus(undefined).pipe(
          Effect.map((status) => Setup.GitHubDataSyncStatus.make(status)),
          Effect.catch(internalFailure("data sync status lookup")),
        ),
      refreshGitHubData: () =>
        queue
          .enqueue({
            _tag: "SyncAllGitHubData",
            trigger: "manual",
            force: true,
          })
          .pipe(
            Effect.as(Setup.GitHubDataSyncAccepted.make({ accepted: true })),
            Effect.catch(internalFailure("data sync enqueue")),
          ),
    })
  }),
).pipe(Layer.provide(LabelingAdminMiddlewareLayer))
