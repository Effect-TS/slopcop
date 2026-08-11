import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as Audit from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import type { RepositoryErrorCause } from "@slopcop/infra/Sql/RepositoryError"
import { UnexpectedRowCount } from "@slopcop/infra/Sql/RepositoryError"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

export class LabelingRuleAuditLogRepoError extends Data.TaggedError(
  "LabelingRuleAuditLogRepoError",
)<{
  readonly operation: "Append" | "ListActivity" | "ListByRepository"
  readonly cause: RepositoryErrorCause
}> {}
export interface ListAuditOptions {
  readonly ruleId: LabelingRule.LabelingRule["id"] | null
  readonly operation: Audit.LabelingRuleAuditEntry["operation"] | null
  readonly cursor: {
    readonly createdAt: number
    readonly id: Audit.LabelingRuleAuditEntry["id"]
  } | null
  readonly limit: number
}
const ListRepositoryRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  ruleId: Schema.NullOr(LabelingRule.LabelingRuleId),
  operation: Schema.NullOr(Audit.LabelingRuleAuditOperation),
  cursorCreatedAt: Schema.NullOr(Schema.Int),
  cursorId: Schema.NullOr(Audit.LabelingRuleAuditEntryId),
  limit: Schema.Int,
})
export const LabelingRuleAuditActivityRow = Schema.Struct({
  ...Audit.LabelingRuleAuditEntry.select.fields,
  owner: Schema.String,
  repo: Schema.String,
})
export type LabelingRuleAuditActivityRow =
  typeof LabelingRuleAuditActivityRow.Type
const ListActivityRequest = Schema.Struct({
  repository: Schema.NullOr(Schema.String),
  operation: Schema.NullOr(Audit.LabelingRuleAuditOperation),
  cursorCreatedAt: Schema.NullOr(Schema.Int),
  cursorId: Schema.NullOr(Audit.LabelingRuleAuditEntryId),
  limit: Schema.Int,
})
export class LabelingRuleAuditLogRepo extends Context.Service<
  LabelingRuleAuditLogRepo,
  {
    readonly append: (
      entry: typeof Audit.LabelingRuleAuditEntry.insert.Type,
    ) => Effect.Effect<
      Audit.LabelingRuleAuditEntry,
      LabelingRuleAuditLogRepoError
    >
    readonly listByRepository: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      options: ListAuditOptions,
    ) => Effect.Effect<
      ReadonlyArray<Audit.LabelingRuleAuditEntry>,
      LabelingRuleAuditLogRepoError
    >
    readonly listActivity: (options: {
      readonly repository: string | null
      readonly operation: Audit.LabelingRuleAuditEntry["operation"] | null
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
    const appendRow = SqlSchema.findOneOption({
      Request: Audit.LabelingRuleAuditEntry.insert,
      Result: Audit.LabelingRuleAuditEntry,
      execute: (entry) =>
        sql`INSERT INTO labeling_rule_audit_log ${sql.insert(entry)} RETURNING *`,
    })
    const listRepository = SqlSchema.findAll({
      Request: ListRepositoryRequest,
      Result: Audit.LabelingRuleAuditEntry,
      execute: ({
        cursorCreatedAt,
        cursorId,
        limit,
        operation,
        repositoryId,
        ruleId,
      }) => sql`
        SELECT * FROM labeling_rule_audit_log WHERE repository_id=${repositoryId}
          AND deleted_at IS NULL
          AND (${ruleId} IS NULL OR COALESCE(json_extract(after,'$.id'),json_extract(before,'$.id'))=${ruleId})
          AND (${operation} IS NULL OR operation=${operation})
          AND (${cursorCreatedAt} IS NULL OR ${cursorId} IS NULL OR created_at<${cursorCreatedAt} OR (created_at=${cursorCreatedAt} AND id<${cursorId}))
        ORDER BY created_at DESC,id DESC LIMIT ${limit}`,
    })
    const listAll = SqlSchema.findAll({
      Request: ListActivityRequest,
      Result: LabelingRuleAuditActivityRow,
      execute: ({
        cursorCreatedAt,
        cursorId,
        limit,
        operation,
        repository,
      }) => sql`
        SELECT audit.*,repositories.owner,repositories.repo FROM labeling_rule_audit_log AS audit
        INNER JOIN github_repositories AS repositories ON repositories.id=audit.repository_id
        WHERE audit.deleted_at IS NULL AND repositories.deleted_at IS NULL
          AND (${repository} IS NULL OR repositories.owner||'/'||repositories.repo=${repository})
          AND (${operation} IS NULL OR audit.operation=${operation})
          AND (${cursorCreatedAt} IS NULL OR ${cursorId} IS NULL OR audit.created_at<${cursorCreatedAt} OR (audit.created_at=${cursorCreatedAt} AND audit.id<${cursorId}))
        ORDER BY audit.created_at DESC,audit.id DESC LIMIT ${limit}`,
    })
    const error =
      (operation: LabelingRuleAuditLogRepoError["operation"]) =>
      (cause: RepositoryErrorCause) =>
        new LabelingRuleAuditLogRepoError({ operation, cause })
    return {
      append: (entry) =>
        appendRow(entry).pipe(
          Effect.mapError(error("Append")),
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  new LabelingRuleAuditLogRepoError({
                    operation: "Append",
                    cause: new UnexpectedRowCount({ expected: 1, actual: 0 }),
                  }),
                ),
              onSome: Effect.succeed,
            }),
          ),
        ),
      listByRepository: (repositoryId, options) =>
        listRepository({
          repositoryId,
          ruleId: options.ruleId,
          operation: options.operation,
          cursorCreatedAt: options.cursor?.createdAt ?? null,
          cursorId: options.cursor?.id ?? null,
          limit: options.limit,
        }).pipe(Effect.mapError(error("ListByRepository"))),
      listActivity: (options) =>
        listAll({
          repository: options.repository,
          operation: options.operation,
          cursorCreatedAt: options.cursor?.createdAt ?? null,
          cursorId: options.cursor?.id ?? null,
          limit: options.limit,
        }).pipe(Effect.mapError(error("ListActivity"))),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
