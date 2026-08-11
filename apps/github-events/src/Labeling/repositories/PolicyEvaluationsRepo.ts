import * as Evaluation from "@slopcop/domain/Labeling/PolicyEvaluation"
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

export class PolicyEvaluationsRepoError extends Data.TaggedError(
  "PolicyEvaluationsRepoError",
)<{
  readonly operation: "RecordEvaluation" | "RecordAction" | "CompleteAction"
  readonly cause: RepositoryErrorCause
}> {}

export class PolicyEvaluationsRepo extends Context.Service<
  PolicyEvaluationsRepo,
  {
    readonly recordEvaluation: (
      evaluation: typeof Evaluation.PolicyEvaluation.insert.Type,
    ) => Effect.Effect<Evaluation.PolicyEvaluation, PolicyEvaluationsRepoError>
    readonly recordAction: (
      action: typeof Evaluation.PolicyActionExecution.insert.Type,
    ) => Effect.Effect<
      Evaluation.PolicyActionExecution,
      PolicyEvaluationsRepoError
    >
    readonly completeAction: (
      id: Evaluation.PolicyActionExecution["id"],
      applied: boolean,
    ) => Effect.Effect<
      Evaluation.PolicyActionExecution,
      PolicyEvaluationsRepoError
    >
  }
>()("@slopcop/github-events/Labeling/repositories/PolicyEvaluationsRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const insertEvaluation = SqlSchema.findOneOption({
      Request: Evaluation.PolicyEvaluation.insert,
      Result: Evaluation.PolicyEvaluation,
      execute: (input) => sql`
        INSERT INTO policy_evaluations ${sql.insert(input)}
        ON CONFLICT (delivery_id,rule_id,rule_version,subject_number,subject_generation)
        DO UPDATE SET
          policy_id=excluded.policy_id,
          policy_version_id=excluded.policy_version_id,
          evaluator=excluded.evaluator,
          gate_policy_id=excluded.gate_policy_id,
          gate_policy_version_id=excluded.gate_policy_version_id,
          outcome=excluded.outcome,
          confidence=excluded.confidence,
          rationale=excluded.rationale,
          trace=excluded.trace,
          gate_trace=excluded.gate_trace,
          automation_revision=excluded.automation_revision
        RETURNING *`,
    })
    const insertAction = SqlSchema.findOneOption({
      Request: Evaluation.PolicyActionExecution.insert,
      Result: Evaluation.PolicyActionExecution,
      execute: (input) => sql`
        INSERT INTO policy_action_executions ${sql.insert(input)}
        ON CONFLICT (evaluation_id,rule_id)
        DO UPDATE SET
          action=excluded.action,
          label=excluded.label,
          selected=excluded.selected,
          status='planned',
          applied=0
        RETURNING *`,
    })
    const completeAction = SqlSchema.findOneOption({
      Request: Schema.Struct({
        id: Evaluation.PolicyActionExecutionId,
        applied: Schema.Boolean,
      }),
      Result: Evaluation.PolicyActionExecution,
      execute: ({ applied, id }) => sql`
        UPDATE policy_action_executions
        SET status='completed',applied=${applied}
        WHERE id=${id} RETURNING *`,
    })
    const requireOne = <A>(
      operation: PolicyEvaluationsRepoError["operation"],
      row: Option.Option<A>,
    ) =>
      Option.match(row, {
        onNone: () =>
          Effect.fail(
            new PolicyEvaluationsRepoError({
              operation,
              cause: new UnexpectedRowCount({ expected: 1, actual: 0 }),
            }),
          ),
        onSome: Effect.succeed,
      })
    const mapError =
      (operation: PolicyEvaluationsRepoError["operation"]) =>
      (cause: RepositoryErrorCause) =>
        new PolicyEvaluationsRepoError({ operation, cause })
    return {
      recordEvaluation: (input) =>
        insertEvaluation(input).pipe(
          Effect.mapError(mapError("RecordEvaluation")),
          Effect.flatMap((row) => requireOne("RecordEvaluation", row)),
        ),
      recordAction: (input) =>
        insertAction(input).pipe(
          Effect.mapError(mapError("RecordAction")),
          Effect.flatMap((row) => requireOne("RecordAction", row)),
        ),
      completeAction: (id, applied) =>
        completeAction({ id, applied }).pipe(
          Effect.mapError(mapError("CompleteAction")),
          Effect.flatMap((row) => requireOne("CompleteAction", row)),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
