import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import { evaluateAiLabelingRule } from "@slopcop/labeling/AiLabelingRuleEvaluator"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const now = DateTime.fromDateUnsafe(new Date("2026-08-11T00:00:00Z"))
const rule = new Rule.AiLabelingRule({
  _tag: "AiLabelingRule",
  id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("rule"),
  repositoryId: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)(
    "repo",
  ),
  label: "bug",
  onMatch: "ensure-present",
  onNoMatch: "preserve",
  conflictGroup: null,
  priority: 0,
  enabled: true,
  validationStatus: "valid",
  validatedAt: now,
  version: 1,
  prompt: "Is this a bug fix?",
  evidence: ["pull_request.title", "pull_request.body"],
  minimumConfidence: 0.8,
  evaluator: "boolean-policy-v1",
  gatePolicyId: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const facts = {
  draft: false,
  title: "Fix parser",
  body: "Corrects invalid parsing",
  baseRef: "main",
  headSha: "sha",
  currentLabels: [],
  changedFiles: null,
  changedFilesComplete: null,
  requiredChecks: null,
  latestReviews: null,
}

describe("AiLabelingRuleEvaluator", () => {
  it.effect("projects requested evidence and applies minimum confidence", () =>
    Effect.gen(function* () {
      let evidence: Readonly<Record<string, unknown>> = {}
      const result = yield* evaluateAiLabelingRule({
        rule,
        facts,
        ai: {
          evaluate: (input) =>
            Effect.sync(() => {
              evidence = input.evidence
              return { matches: true, confidence: 0.79, rationale: "Likely" }
            }),
        },
      })
      expect(evidence).toEqual({
        "pull_request.title": "Fix parser",
        "pull_request.body": "Corrects invalid parsing",
      })
      expect(result).toMatchObject({ outcome: "Abstain", confidence: 0.79 })
    }),
  )
})
