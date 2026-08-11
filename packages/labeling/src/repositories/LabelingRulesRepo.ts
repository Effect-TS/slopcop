import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import type { RepositoryErrorCause } from "@slopcop/infra/Sql/RepositoryError"
import { UnexpectedRowCount } from "@slopcop/infra/Sql/RepositoryError"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

export interface ListRulesOptions {
  readonly includeDisabled: boolean
}
export class LabelingRulesRepoError extends Data.TaggedError(
  "LabelingRulesRepoError",
)<{
  readonly operation:
    | "ListByRepository"
    | "FindById"
    | "Insert"
    | "Update"
    | "Remove"
    | "ListStaleEnabled"
  readonly cause: RepositoryErrorCause
}> {}
const ListRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  includeDisabled: Schema.Boolean,
})
const FindRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  ruleId: LabelingRule.LabelingRuleId,
})
const UpdateRequest = Schema.Struct({
  ruleId: LabelingRule.LabelingRuleId,
  expectedVersion: Schema.Int,
  input: LabelingRule.LabelingRuleUpdate,
})
const RemoveRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  ruleId: LabelingRule.LabelingRuleId,
  expectedVersion: Schema.Int,
})
const StaleRequest = Schema.Struct({
  validatedBefore: Schema.DateTimeUtcFromMillis,
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
})

export class LabelingRulesRepo extends Context.Service<
  LabelingRulesRepo,
  {
    readonly listByRepository: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      options: ListRulesOptions,
    ) => Effect.Effect<
      ReadonlyArray<LabelingRule.LabelingRule>,
      LabelingRulesRepoError
    >
    readonly findById: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      ruleId: LabelingRule.LabelingRule["id"],
    ) => Effect.Effect<
      Option.Option<LabelingRule.LabelingRule>,
      LabelingRulesRepoError
    >
    readonly insert: (
      input: LabelingRule.LabelingRuleInsert,
    ) => Effect.Effect<LabelingRule.LabelingRule, LabelingRulesRepoError>
    readonly update: (
      ruleId: LabelingRule.LabelingRule["id"],
      expectedVersion: number,
      input: LabelingRule.LabelingRuleUpdate,
    ) => Effect.Effect<LabelingRule.LabelingRule, LabelingRulesRepoError>
    readonly remove: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      ruleId: LabelingRule.LabelingRule["id"],
      expectedVersion: number,
    ) => Effect.Effect<void, LabelingRulesRepoError>
    readonly listStaleEnabled: (
      validatedBefore: DateTime.Utc,
      limit: number,
    ) => Effect.Effect<
      ReadonlyArray<LabelingRule.LabelingRule>,
      LabelingRulesRepoError
    >
  }
>()("@slopcop/labeling/repositories/LabelingRulesRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const listRows = SqlSchema.findAll({
      Request: ListRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ includeDisabled, repositoryId }) =>
        includeDisabled
          ? sql`SELECT * FROM labeling_rules WHERE repository_id=${repositoryId} AND deleted_at IS NULL ORDER BY created_at,id`
          : sql`SELECT * FROM labeling_rules WHERE repository_id=${repositoryId} AND enabled=1 AND deleted_at IS NULL ORDER BY created_at,id`,
    })
    const findRow = SqlSchema.findOneOption({
      Request: FindRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ repositoryId, ruleId }) =>
        sql`SELECT * FROM labeling_rules WHERE repository_id=${repositoryId} AND id=${ruleId} AND deleted_at IS NULL`,
    })
    const insertRow = SqlSchema.findOneOption({
      Request: LabelingRule.LabelingRuleInsert,
      Result: LabelingRule.LabelingRule,
      execute: (input) =>
        sql`INSERT INTO labeling_rules ${sql.insert(input)} RETURNING *`,
    })
    const updateRow = SqlSchema.findOneOption({
      Request: UpdateRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ expectedVersion, input, ruleId }) =>
        input._tag === "PolicyLabelingRule"
          ? sql`
            UPDATE labeling_rules SET policy_id=${input.policyId},
              prompt=NULL,evidence=NULL,minimum_confidence=NULL,evaluator=NULL,
              gate_policy_id=NULL,label=${input.label},on_match=${input.onMatch},
              on_no_match=${input.onNoMatch},conflict_group=${input.conflictGroup},
              priority=${input.priority},enabled=${input.enabled},
              validation_status=${input.validationStatus},validated_at=${input.validatedAt},
              version=version+1,updated_at=unixepoch()*1000
            WHERE id=${ruleId} AND version=${expectedVersion}
              AND _tag='PolicyLabelingRule' AND deleted_at IS NULL RETURNING *`
          : sql`
            UPDATE labeling_rules SET policy_id=NULL,prompt=${input.prompt},
              evidence=${input.evidence},minimum_confidence=${input.minimumConfidence},
              evaluator=${input.evaluator},gate_policy_id=${input.gatePolicyId},
              label=${input.label},on_match=${input.onMatch},
              on_no_match=${input.onNoMatch},conflict_group=${input.conflictGroup},
              priority=${input.priority},enabled=${input.enabled},
              validation_status=${input.validationStatus},validated_at=${input.validatedAt},
              version=version+1,updated_at=unixepoch()*1000
            WHERE id=${ruleId} AND version=${expectedVersion}
              AND _tag='AiLabelingRule' AND deleted_at IS NULL RETURNING *`,
    })
    const removeRow = SqlSchema.findOneOption({
      Request: RemoveRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ expectedVersion, repositoryId, ruleId }) => sql`
        UPDATE labeling_rules SET deleted_at=unixepoch()*1000,
          updated_at=unixepoch()*1000,version=version+1
        WHERE repository_id=${repositoryId}
          AND id=${ruleId} AND version=${expectedVersion} AND deleted_at IS NULL RETURNING *`,
    })
    const staleRows = SqlSchema.findAll({
      Request: StaleRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ limit, validatedBefore }) => sql`
        SELECT * FROM labeling_rules WHERE enabled=1
          AND (validated_at IS NULL OR validated_at<${validatedBefore})
          AND deleted_at IS NULL ORDER BY validated_at,id LIMIT ${limit}`,
    })
    const mapError =
      (operation: LabelingRulesRepoError["operation"]) =>
      (cause: RepositoryErrorCause) =>
        new LabelingRulesRepoError({ operation, cause })
    const requireOne =
      (operation: LabelingRulesRepoError["operation"]) =>
      (row: Option.Option<LabelingRule.LabelingRule>) =>
        Option.match(row, {
          onNone: () =>
            Effect.fail(
              new LabelingRulesRepoError({
                operation,
                cause: new UnexpectedRowCount({ expected: 1, actual: 0 }),
              }),
            ),
          onSome: Effect.succeed,
        })
    return {
      listByRepository: (repositoryId, options) =>
        listRows({
          repositoryId,
          includeDisabled: options.includeDisabled,
        }).pipe(Effect.mapError(mapError("ListByRepository"))),
      findById: (repositoryId, ruleId) =>
        findRow({ repositoryId, ruleId }).pipe(
          Effect.mapError(mapError("FindById")),
        ),
      insert: (input) =>
        insertRow(input).pipe(
          Effect.mapError(mapError("Insert")),
          Effect.flatMap(requireOne("Insert")),
        ),
      update: (ruleId, expectedVersion, input) =>
        updateRow({ ruleId, expectedVersion, input }).pipe(
          Effect.mapError(mapError("Update")),
          Effect.flatMap(requireOne("Update")),
        ),
      remove: (repositoryId, ruleId, expectedVersion) =>
        removeRow({ repositoryId, ruleId, expectedVersion }).pipe(
          Effect.mapError(mapError("Remove")),
          Effect.flatMap(requireOne("Remove")),
          Effect.asVoid,
        ),
      listStaleEnabled: (validatedBefore, limit) =>
        staleRows({ validatedBefore, limit }).pipe(
          Effect.mapError(mapError("ListStaleEnabled")),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
