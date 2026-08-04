import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
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

export class LabelingRuleAuditLogRepoError extends Data.TaggedError(
  "LabelingRuleAuditLogRepoError",
)<{
  readonly operation: "Append" | "ListActivity" | "ListByRepository"
  readonly cause: RepositoryErrorCause
}> {}

export interface ListAuditOptions {
  readonly ruleId: LabelingRule.LabelingRule["id"] | null
  readonly operation:
    | LabelingRuleAuditEntry.LabelingRuleAuditEntry["operation"]
    | null
  readonly cursor: {
    readonly createdAt: number
    readonly id: LabelingRuleAuditEntry.LabelingRuleAuditEntry["id"]
  } | null
  readonly limit: number
}

const ListByRepositoryRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  ruleId: Schema.NullOr(LabelingRule.LabelingRuleId),
  operation: Schema.NullOr(LabelingRuleAuditEntry.LabelingRuleAuditOperation),
  cursorCreatedAt: Schema.NullOr(Schema.Int),
  cursorId: Schema.NullOr(LabelingRuleAuditEntry.LabelingRuleAuditEntryId),
  limit: Schema.Int,
})

export const LabelingRuleAuditActivityRow = Schema.Struct({
  ...LabelingRuleAuditEntry.LabelingRuleAuditEntry.select.fields,
  owner: Schema.String,
  repo: Schema.String,
})
export type LabelingRuleAuditActivityRow =
  typeof LabelingRuleAuditActivityRow.Type

const ListActivityRequest = Schema.Struct({
  repository: Schema.NullOr(Schema.String),
  operation: Schema.NullOr(LabelingRuleAuditEntry.LabelingRuleAuditOperation),
  cursorCreatedAt: Schema.NullOr(Schema.Int),
  cursorId: Schema.NullOr(LabelingRuleAuditEntry.LabelingRuleAuditEntryId),
  limit: Schema.Int,
})

export class LabelingRuleAuditLogRepo extends Context.Service<
  LabelingRuleAuditLogRepo,
  {
    readonly append: (
      entry: typeof LabelingRuleAuditEntry.LabelingRuleAuditEntry.insert.Type,
    ) => Effect.Effect<
      LabelingRuleAuditEntry.LabelingRuleAuditEntry,
      LabelingRuleAuditLogRepoError
    >
    readonly listByRepository: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      options: ListAuditOptions,
    ) => Effect.Effect<
      ReadonlyArray<LabelingRuleAuditEntry.LabelingRuleAuditEntry>,
      LabelingRuleAuditLogRepoError
    >
    readonly listActivity: (options: {
      readonly repository: string | null
      readonly operation:
        | LabelingRuleAuditEntry.LabelingRuleAuditEntry["operation"]
        | null
      readonly cursor: ListAuditOptions["cursor"]
      readonly limit: number
    }) => Effect.Effect<
      ReadonlyArray<LabelingRuleAuditActivityRow>,
      LabelingRuleAuditLogRepoError
    >
  }
>()("@slopcop/labeling/repositories/LabelingRuleAuditLogRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const append = SqlSchema.findOneOption({
      Request: LabelingRuleAuditEntry.LabelingRuleAuditEntry.insert,
      Result: LabelingRuleAuditEntry.LabelingRuleAuditEntry.select,
      execute: (entry) => sql`
        INSERT INTO "labeling_rule_audit_log" ${sql.insert(entry)}
        RETURNING *
      `,
    })

    const listByRepository = SqlSchema.findAll({
      Request: ListByRepositoryRequest,
      Result: LabelingRuleAuditEntry.LabelingRuleAuditEntry.select,
      execute: ({
        repositoryId,
        ruleId,
        operation,
        cursorCreatedAt,
        cursorId,
        limit,
      }) =>
        sql`
          SELECT *
          FROM "labeling_rule_audit_log"
          WHERE "repository_id" = ${repositoryId}
            AND "deleted_at" IS NULL
            AND (
              ${ruleId} IS NULL
              OR COALESCE(
                json_extract("after", '$.id'),
                json_extract("before", '$.id')
              ) = ${ruleId}
            )
            AND (${operation} IS NULL OR "operation" = ${operation})
            AND (
              ${cursorCreatedAt} IS NULL
              OR ${cursorId} IS NULL
              OR "created_at" < ${cursorCreatedAt}
              OR ("created_at" = ${cursorCreatedAt} AND "id" < ${cursorId})
            )
          ORDER BY "created_at" DESC, "id" DESC
          LIMIT ${limit}
        `,
    })

    const listActivity = SqlSchema.findAll({
      Request: ListActivityRequest,
      Result: LabelingRuleAuditActivityRow,
      execute: ({
        repository,
        operation,
        cursorCreatedAt,
        cursorId,
        limit,
      }) => sql`
        SELECT "audit".*, "repository"."owner", "repository"."repo"
        FROM "labeling_rule_audit_log" AS "audit"
        INNER JOIN "github_repositories" AS "repository"
          ON "repository"."id" = "audit"."repository_id"
        WHERE "audit"."deleted_at" IS NULL
          AND "repository"."deleted_at" IS NULL
          AND (
            ${repository} IS NULL
            OR ("repository"."owner" || '/' || "repository"."repo") = ${repository}
          )
          AND (${operation} IS NULL OR "audit"."operation" = ${operation})
          AND (
            ${cursorCreatedAt} IS NULL
            OR ${cursorId} IS NULL
            OR "audit"."created_at" < ${cursorCreatedAt}
            OR (
              "audit"."created_at" = ${cursorCreatedAt}
              AND "audit"."id" < ${cursorId}
            )
          )
        ORDER BY "audit"."created_at" DESC, "audit"."id" DESC
        LIMIT ${limit}
      `,
    })

    return {
      append: (entry) =>
        append(entry).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(new UnexpectedRowCount({ expected: 1, actual: 0 })),
              onSome: Effect.succeed,
            }),
          ),
          Effect.mapError(
            (cause) =>
              new LabelingRuleAuditLogRepoError({ operation: "Append", cause }),
          ),
        ),
      listByRepository: (repositoryId, options) =>
        listByRepository({
          repositoryId,
          ruleId: options.ruleId,
          operation: options.operation,
          cursorCreatedAt: options.cursor?.createdAt ?? null,
          cursorId: options.cursor?.id ?? null,
          limit: options.limit,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new LabelingRuleAuditLogRepoError({
                operation: "ListByRepository",
                cause,
              }),
          ),
        ),
      listActivity: (options) =>
        listActivity({
          repository: options.repository,
          operation: options.operation,
          cursorCreatedAt: options.cursor?.createdAt ?? null,
          cursorId: options.cursor?.id ?? null,
          limit: options.limit,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new LabelingRuleAuditLogRepoError({
                operation: "ListActivity",
                cause,
              }),
          ),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
