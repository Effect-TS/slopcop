import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import type { RepositoryErrorCause } from "@slopcop/infra/Sql/RepositoryError"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

export const LabelingRuleFireCount = Schema.Struct({
  ruleId: LabelingRule.LabelingRuleId,
  fires: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type LabelingRuleFireCount = typeof LabelingRuleFireCount.Type
const Request = Schema.Struct({
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
    const rows = SqlSchema.findAll({
      Request,
      Result: LabelingRuleFireCount,
      execute: ({ repositoryId, since }) => sql`
        SELECT fired.rule_id,COUNT(*) AS fires
        FROM (
          SELECT action.rule_id,evaluation.repository_id,evaluation.created_at
          FROM policy_action_executions AS action
          INNER JOIN policy_evaluations AS evaluation ON evaluation.id=action.evaluation_id
          WHERE action.selected=1
          UNION ALL
          SELECT selected.value,decision.repository_id,decision.created_at
          FROM labeling_decisions AS decision
          CROSS JOIN json_each(decision.selected_rule_ids) AS selected
          WHERE decision.deleted_at IS NULL
        ) AS fired
        INNER JOIN labeling_rules AS rule
          ON rule.id=fired.rule_id AND rule.repository_id=fired.repository_id
        WHERE fired.repository_id=${repositoryId} AND fired.created_at>=${since}
        GROUP BY fired.rule_id ORDER BY fired.rule_id`,
    })
    return {
      listRecentFires: (repositoryId, since) =>
        rows({ repositoryId, since }).pipe(
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
