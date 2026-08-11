import * as AiPromptTemplate from "@slopcop/domain/Labeling/AiPromptTemplate"
import type * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
import * as Effect from "effect/Effect"
import { PolicyAiError, type PolicyAiEvaluator } from "./PolicyAi.ts"
import type { PullRequestFacts } from "./PolicyEngine.ts"

const fact = (
  facts: PullRequestFacts,
  name: Program.PullRequestFact,
): unknown => {
  switch (name) {
    case "pull_request.draft":
      return facts.draft
    case "pull_request.title":
      return facts.title
    case "pull_request.body":
      return facts.body
    case "pull_request.base_ref":
      return facts.baseRef
    case "pull_request.head_sha":
      return facts.headSha
    case "pull_request.current_labels":
      return facts.currentLabels
    case "pull_request.changed_files":
      return facts.changedFiles
    case "pull_request.required_checks":
      return facts.requiredChecks
    case "pull_request.latest_reviews":
      return facts.latestReviews
  }
}

export const evaluateAiLabelingRule = Effect.fn(
  "AiLabelingRuleEvaluator.evaluate",
)(function* (input: {
  readonly rule: Rule.AiLabelingRule
  readonly facts: PullRequestFacts
  readonly ai: PolicyAiEvaluator
}) {
  const evidence = Object.fromEntries(
    input.rule.evidence.map((name) => [name, fact(input.facts, name)]),
  )
  const rendered = AiPromptTemplate.render(input.rule.prompt, evidence)
  if (rendered._tag === "Invalid")
    return yield* new PolicyAiError({
      message: `The AI prompt template is invalid: ${rendered.message}`,
      cause: rendered,
    })
  const result = yield* input.ai.evaluate({
    evaluator: input.rule.evaluator,
    prompt: rendered.prompt,
    evidence,
  })
  if (result.confidence < input.rule.minimumConfidence)
    return {
      outcome: "Abstain",
      confidence: result.confidence,
      rationale: `AI confidence ${result.confidence} was below the required ${input.rule.minimumConfidence}.`,
      trace: [],
    } satisfies Program.PolicyEvaluationResult
  return {
    outcome: result.matches ? "Match" : "NoMatch",
    confidence: result.confidence,
    rationale: result.rationale,
    trace: [],
  } satisfies Program.PolicyEvaluationResult
})
