import type * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import type * as Management from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { evaluateAiLabelingRule } from "@slopcop/labeling/AiLabelingRuleEvaluator"
import {
  LabelingRules,
  type LabelingRulesError,
} from "@slopcop/labeling/LabelingRules"
import { PolicyAi } from "@slopcop/labeling/PolicyAi"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
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
    const facts = yield* PolicyFacts
    const ai = yield* PolicyAi
    const run = Effect.fn("LabelingRuleTester.test")(function* (
      slug: { readonly owner: string; readonly repo: string },
      ruleId: Rule.LabelingRule["id"],
      pullRequestNumber: number,
    ) {
      const rule = yield* rules.get(slug, ruleId)
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
      const decision =
        rule._tag === "PolicyLabelingRule"
          ? (yield* policies.test(slug, rule.policyId, pullRequestNumber))
              .decision
          : yield* Effect.gen(function* () {
              if (rule.gatePolicyId !== null) {
                const gate = yield* policies.test(
                  slug,
                  rule.gatePolicyId,
                  pullRequestNumber,
                )
                if (gate.decision.outcome !== "Match")
                  return {
                    outcome: "Abstain" as const,
                    confidence: gate.decision.confidence,
                    rationale: `AI gate ${gate.decision.outcome === "NoMatch" ? "did not match" : "abstained"}.`,
                    trace: gate.decision.trace,
                  }
              }
              const summary = yield* github.getPullRequest(
                repository.value,
                pullRequestNumber,
              )
              const snapshot = yield* facts.load(
                repository.value,
                summary,
                {
                  facts: new Set(rule.evidence),
                  changedFileContentSelectors: [],
                },
                labels,
              )
              return yield* evaluateAiLabelingRule({
                rule,
                facts: snapshot,
                ai,
              })
            })
      const action: "add" | "remove" | "preserve" =
        decision.outcome === "Match"
          ? labels.has(rule.label)
            ? "preserve"
            : "add"
          : decision.outcome === "NoMatch" &&
              rule.onNoMatch === "ensure-absent" &&
              labels.has(rule.label)
            ? "remove"
            : "preserve"
      const shared = {
        ruleId,
        pullRequestNumber,
        outcome: decision.outcome,
        confidence: decision.confidence,
        rationale: decision.rationale,
        proposedAction: action,
        proposedLabelChanges: {
          add: action === "add" ? [rule.label] : [],
          remove: action === "remove" ? [rule.label] : [],
        },
      }
      return rule._tag === "PolicyLabelingRule"
        ? { ...shared, _tag: rule._tag, policyId: rule.policyId }
        : { ...shared, _tag: rule._tag, gatePolicyId: rule.gatePolicyId }
    })
    return {
      test: (slug, ruleId, pullRequestNumber) =>
        run(slug, ruleId, pullRequestNumber).pipe(
          Effect.mapError(
            (cause): LabelingRulesError | LabelingRuleTestError => {
              switch (cause._tag) {
                case "DuplicateLabelingRule":
                case "GitHubLabelValidationError":
                case "InvalidLabelingRule":
                case "LabelingRuleConflict":
                case "LabelingRuleNotFound":
                case "RepositoryNotConfigured":
                case "StaleLabelingRulesRevision":
                case "LabelingRuleAuditLogRepoError":
                case "LabelingRuleStatsRepoError":
                case "LabelingRulesRepoError":
                case "PoliciesRepoError":
                case "GitHubRepositoriesRepoError":
                case "SqlError":
                  return cause
              }
              return new LabelingRuleTestError({
                repository: `${slug.owner}/${slug.repo}`,
                ruleId,
                pullRequestNumber,
                retryable:
                  cause._tag === "LabelingPolicyTestError"
                    ? cause.retryable
                    : cause._tag === "GitHubClientError"
                      ? cause.retryable
                      : false,
                notFound:
                  cause._tag === "LabelingPolicyTestError"
                    ? cause.notFound
                    : cause._tag === "GitHubClientError"
                      ? cause.operation === "GitHubClient.getPullRequest" &&
                        cause.status === 404
                      : cause._tag === "PolicyNotFound",
                cause,
              })
            },
          ),
        ),
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
}
