import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import type { RepositoryErrorCause } from "@slopcop/infra/Sql/RepositoryError"

export const LabelingRuleFireCount = Schema.Struct({
  ruleId: LabelingRule.LabelingRuleId,
  fires: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type LabelingRuleFireCount = typeof LabelingRuleFireCount.Type

const ListRecentRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  since: Schema.Int,
})

export class LabelingRuleStatsRepoError extends Data.TaggedError(
  "LabelingRuleStatsRepoError",
)<{
  readonly operation: "ListRecentFires"
  readonly cause: RepositoryErrorCause
}> {}

export class LabelingRuleStatsRepo extends Context.Service<
  LabelingRuleStatsRepo,
  {
    readonly listRecentFires: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      since: number,
    ) => Effect.Effect<
      ReadonlyArray<LabelingRuleFireCount>,
      LabelingRuleStatsRepoError
    >
  }
>()("@slopcop/labeling/repositories/LabelingRuleStatsRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const listRecentFires = SqlSchema.findAll({
      Request: ListRecentRequest,
      Result: LabelingRuleFireCount,
      execute: ({ repositoryId, since }) => sql`
        SELECT
          selected.value AS "rule_id",
          COUNT(*) AS "fires"
        FROM "labeling_decisions" AS decision
        CROSS JOIN json_each(decision."selected_rule_ids") AS selected
        INNER JOIN "labeling_rules" AS rule
          ON rule."id" = selected.value
          AND rule."repository_id" = decision."repository_id"
          AND rule."deleted_at" IS NULL
        WHERE decision."repository_id" = ${repositoryId}
          AND decision."created_at" >= ${since}
          AND decision."deleted_at" IS NULL
        GROUP BY selected.value
        ORDER BY selected.value ASC
      `,
    })

    return {
      listRecentFires: (repositoryId, since) =>
        listRecentFires({ repositoryId, since }).pipe(
          Effect.mapError(
            (cause) =>
              new LabelingRuleStatsRepoError({
                operation: "ListRecentFires",
                cause,
              }),
          ),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
