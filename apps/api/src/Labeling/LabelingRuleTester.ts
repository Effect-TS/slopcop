import type * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import type * as Management from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { planLabelActions } from "@slopcop/labeling/LabelActions"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { LabelingPolicyTester } from "./LabelingPolicyTester.ts"

export class LabelingRuleTestError extends Data.TaggedError(
  "LabelingRuleTestError",
)<{
  readonly repository: string
  readonly ruleId: string
  readonly pullRequestNumber: number
  readonly retryable: boolean
  readonly notFound: boolean
  readonly cause: unknown
}> {}
export class LabelingRuleTester extends Context.Service<
  LabelingRuleTester,
  {
    readonly test: (
      slug: { readonly owner: string; readonly repo: string },
      ruleId: Rule.LabelingRule["id"],
      pullRequestNumber: number,
    ) => Effect.Effect<
      typeof Management.TestLabelingRuleResponse.Type,
      | LabelingRuleTestError
      | import("@slopcop/labeling/LabelingRules").LabelingRulesError
    >
  }
>()("@slopcop/api/Labeling/LabelingRuleTester", {
  make: Effect.gen(function* () {
    const rules = yield* LabelingRules
    const policies = yield* LabelingPolicyTester
    const repositories = yield* GitHubRepositoriesRepo
    const github = yield* GitHubClient
    const run = Effect.fn("LabelingRuleTester.test")(function* (
      slug: { readonly owner: string; readonly repo: string },
      ruleId: Rule.LabelingRule["id"],
      pullRequestNumber: number,
    ) {
      const rule = yield* rules.get(slug, ruleId)
      const tested = yield* policies.test(
        slug,
        rule.policyId,
        pullRequestNumber,
      )
      const repository = yield* repositories.findBySlug(slug)
      if (Option.isNone(repository))
        return yield* Effect.die(
          "Configured repository disappeared during rule test.",
        )
      const labels = yield* github
        .listItemLabels(repository.value, pullRequestNumber)
        .pipe(
          Stream.runCollect,
          Effect.map((items) => new Set(items.map((item) => item.name))),
        )
      const actions = planLabelActions(
        [rule],
        new Map([[rule.policyId, tested.decision]]),
        labels,
      )
      const action = actions[0]
      if (action === undefined)
        return yield* Effect.die("Rule test produced no action.")
      return {
        ruleId,
        policyId: rule.policyId,
        pullRequestNumber,
        outcome: tested.decision.outcome,
        confidence: tested.decision.confidence,
        rationale: tested.decision.rationale,
        proposedAction: action.action,
        proposedLabelChanges: {
          add: action.action === "add" ? [action.label] : [],
          remove: action.action === "remove" ? [action.label] : [],
        },
      }
    })
    return {
      test: (slug, ruleId, pullRequestNumber) =>
        run(slug, ruleId, pullRequestNumber).pipe(
          Effect.mapError((cause) => {
            if (
              cause._tag !== "LabelingPolicyTestError" &&
              cause._tag !== "GitHubClientError"
            )
              return cause
            return new LabelingRuleTestError({
              repository: `${slug.owner}/${slug.repo}`,
              ruleId,
              pullRequestNumber,
              retryable: cause.retryable,
              notFound:
                cause._tag === "LabelingPolicyTestError"
                  ? cause.notFound
                  : cause.operation === "GitHubClient.getPullRequest" &&
                    cause.status === 404,
              cause,
            })
          }),
        ),
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
}
