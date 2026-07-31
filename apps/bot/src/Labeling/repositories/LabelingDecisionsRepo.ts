import * as LabelingDecision from "@slopcop/domain/Labeling/LabelingDecision"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import type { RepositoryErrorCause } from "../../Sql/RepositoryError.ts"
import { UnexpectedRowCount } from "../../Sql/RepositoryError.ts"

export class LabelingDecisionsRepoError extends Data.TaggedError(
  "LabelingDecisionsRepoError",
)<{
  readonly operation: "Record"
  readonly cause: RepositoryErrorCause
}> {}

export class LabelingDecisionsRepo extends Context.Service<
  LabelingDecisionsRepo,
  {
    readonly record: (
      decision: typeof LabelingDecision.LabelingDecision.insert.Type,
    ) => Effect.Effect<
      LabelingDecision.LabelingDecision,
      LabelingDecisionsRepoError
    >
  }
>()("@slopcop/bot/Labeling/repositories/LabelingDecisionsRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const record = SqlSchema.findOneOption({
      Request: LabelingDecision.LabelingDecision.insert,
      Result: LabelingDecision.LabelingDecision.select,
      execute: (decision) => sql`
        INSERT INTO "labeling_decisions" ${sql.insert(decision)}
        ON CONFLICT (
          "delivery_id",
          "repository_id",
          "subject_type",
          "subject_number",
          "prompt_version"
        ) DO UPDATE SET "id" = "labeling_decisions"."id"
        RETURNING *
      `,
    })

    return {
      record: (decision) =>
        record(decision).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(new UnexpectedRowCount({ expected: 1, actual: 0 })),
              onSome: Effect.succeed,
            }),
          ),
          Effect.mapError(
            (cause) =>
              new LabelingDecisionsRepoError({ operation: "Record", cause }),
          ),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
