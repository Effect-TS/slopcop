import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import type { RepositoryErrorCause } from "../../Sql/RepositoryError.ts"
import { UnexpectedRowCount } from "../../Sql/RepositoryError.ts"

export interface ListRulesOptions {
  readonly includeDisabled: boolean
}

export class LabelingRulesRepoError extends Data.TaggedError(
  "LabelingRulesRepoError",
)<{
  readonly operation:
    | "ListByRepository"
    | "FindById"
    | "FindByLabel"
    | "Insert"
    | "Update"
    | "Remove"
    | "ListStaleEnabled"
  readonly cause: RepositoryErrorCause
}> {}

const RepositoryIdRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  includeDisabled: Schema.Boolean,
})

const RuleIdRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  ruleId: LabelingRule.LabelingRuleId,
})

const RuleLabelRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  label: Schema.String,
})

const UpdateRequest = Schema.Struct({
  ruleId: LabelingRule.LabelingRuleId,
  expectedVersion: Schema.Int,
  input: LabelingRule.LabelingRule.update,
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
    readonly findByLabel: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      label: string,
    ) => Effect.Effect<
      Option.Option<LabelingRule.LabelingRule>,
      LabelingRulesRepoError
    >
    readonly insert: (
      input: typeof LabelingRule.LabelingRule.insert.Type,
    ) => Effect.Effect<LabelingRule.LabelingRule, LabelingRulesRepoError>
    readonly update: (
      ruleId: LabelingRule.LabelingRule["id"],
      expectedVersion: number,
      input: typeof LabelingRule.LabelingRule.update.Type,
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
>()("@slopcop/bot/Labeling/repositories/LabelingRulesRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const listByRepository = SqlSchema.findAll({
      Request: RepositoryIdRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ repositoryId, includeDisabled }) =>
        includeDisabled
          ? sql`
              SELECT *
              FROM "labeling_rules"
              WHERE "repository_id" = ${repositoryId}
                AND "deleted_at" IS NULL
              ORDER BY "created_at" ASC, "id" ASC
            `
          : sql`
              SELECT *
              FROM "labeling_rules"
              WHERE "repository_id" = ${repositoryId}
                AND "enabled" = 1
                AND "deleted_at" IS NULL
              ORDER BY "created_at" ASC, "id" ASC
            `,
    })

    const findById = SqlSchema.findOneOption({
      Request: RuleIdRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ repositoryId, ruleId }) => sql`
        SELECT *
        FROM "labeling_rules"
        WHERE "repository_id" = ${repositoryId}
          AND "id" = ${ruleId}
          AND "deleted_at" IS NULL
      `,
    })

    const findByLabel = SqlSchema.findOneOption({
      Request: RuleLabelRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ repositoryId, label }) => sql`
        SELECT *
        FROM "labeling_rules"
        WHERE "repository_id" = ${repositoryId}
          AND "label" = lower(${label})
          AND "deleted_at" IS NULL
      `,
    })

    const insert = SqlSchema.findOneOption({
      Request: LabelingRule.LabelingRule.insert,
      Result: LabelingRule.LabelingRule,
      execute: (input) => sql`
        INSERT INTO "labeling_rules" ${sql.insert(input)}
        RETURNING *
      `,
    })

    const update = SqlSchema.findOneOption({
      Request: UpdateRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ ruleId, expectedVersion, input }) => sql`
        UPDATE "labeling_rules"
        SET
          "label" = ${input.label},
          "instructions" = ${input.instructions},
          "mode" = ${input.mode},
          "exclusive_group" = ${input.exclusiveGroup},
          "enabled" = ${input.enabled},
          "validation_status" = ${input.validationStatus},
          "validated_at" = ${input.validatedAt},
          "version" = "version" + 1,
          "updated_at" = unixepoch() * 1000
        WHERE "id" = ${ruleId}
          AND "version" = ${expectedVersion}
          AND "deleted_at" IS NULL
        RETURNING *
      `,
    })

    const remove = SqlSchema.findOneOption({
      Request: RemoveRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ repositoryId, ruleId, expectedVersion }) => sql`
        DELETE FROM "labeling_rules"
        WHERE "repository_id" = ${repositoryId}
          AND "id" = ${ruleId}
          AND "version" = ${expectedVersion}
          AND "deleted_at" IS NULL
        RETURNING *
      `,
    })

    const listStaleEnabled = SqlSchema.findAll({
      Request: StaleRequest,
      Result: LabelingRule.LabelingRule,
      execute: ({ validatedBefore, limit }) => sql`
        SELECT *
        FROM "labeling_rules"
        WHERE "enabled" = 1
          AND (
            "validated_at" IS NULL
            OR "validated_at" < ${validatedBefore}
          )
          AND "deleted_at" IS NULL
        ORDER BY "validated_at" ASC, "id" ASC
        LIMIT ${limit}
      `,
    })

    const toLabelingRulesRepoError =
      (operation: LabelingRulesRepoError["operation"]) =>
      (cause: RepositoryErrorCause) =>
        new LabelingRulesRepoError({ operation, cause })

    const requireRow =
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
        listByRepository({
          repositoryId,
          includeDisabled: options.includeDisabled,
        }).pipe(Effect.mapError(toLabelingRulesRepoError("ListByRepository"))),
      findById: (repositoryId, ruleId) =>
        findById({ repositoryId, ruleId }).pipe(
          Effect.mapError(toLabelingRulesRepoError("FindById")),
        ),
      findByLabel: (repositoryId, label) =>
        findByLabel({ repositoryId, label }).pipe(
          Effect.mapError(toLabelingRulesRepoError("FindByLabel")),
        ),
      insert: (input) =>
        insert(input).pipe(
          Effect.mapError(toLabelingRulesRepoError("Insert")),
          Effect.flatMap(requireRow("Insert")),
        ),
      update: (ruleId, expectedVersion, input) =>
        update({ ruleId, expectedVersion, input }).pipe(
          Effect.mapError(toLabelingRulesRepoError("Update")),
          Effect.flatMap(requireRow("Update")),
        ),
      remove: (repositoryId, ruleId, expectedVersion) =>
        remove({ repositoryId, ruleId, expectedVersion }).pipe(
          Effect.mapError(toLabelingRulesRepoError("Remove")),
          Effect.flatMap(requireRow("Remove")),
          Effect.asVoid,
        ),
      listStaleEnabled: (validatedBefore, limit) =>
        listStaleEnabled({ validatedBefore, limit }).pipe(
          Effect.mapError(toLabelingRulesRepoError("ListStaleEnabled")),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
