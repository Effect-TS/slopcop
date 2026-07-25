import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import type { RepositoryErrorCause } from "../../Sql/RepositoryError.ts"
import { UnexpectedRowCount } from "../../Sql/RepositoryError.ts"

export class LabelingRuleAuditLogRepoError extends Data.TaggedError(
  "LabelingRuleAuditLogRepoError",
)<{
  readonly operation: "Append"
  readonly cause: RepositoryErrorCause
}> {}

export class LabelingRuleAuditLogRepo extends Context.Service<
  LabelingRuleAuditLogRepo,
  {
    readonly append: (
      entry: typeof LabelingRuleAuditEntry.LabelingRuleAuditEntry.insert.Type,
    ) => Effect.Effect<
      LabelingRuleAuditEntry.LabelingRuleAuditEntry,
      LabelingRuleAuditLogRepoError
    >
  }
>()("@slopcop/bot/Labeling/repositories/LabelingRuleAuditLogRepo", {
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
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
