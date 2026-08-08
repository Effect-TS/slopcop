import * as LabelClassification from "@slopcop/domain/Labeling/LabelClassification"

export interface LabelPolicyRule {
  readonly id: string
  readonly label: string
  readonly mode: "add-only" | "reconcile"
  readonly confidenceThreshold: number
}

export interface LabelPolicyInput {
  readonly rules: ReadonlyArray<LabelPolicyRule>
  readonly decisions: ReadonlyArray<LabelClassification.RuleDecision>
  readonly currentLabels: ReadonlySet<string>
}

export interface LabelPlan {
  readonly selectedRuleIds: ReadonlyArray<
    LabelClassification.RuleDecision["ruleId"]
  >
  readonly selectedLabels: ReadonlyArray<string>
  readonly changes: LabelClassification.LabelChanges
}

export const planLabels = (input: LabelPolicyInput): LabelPlan => {
  const thresholds = new Map(
    input.rules.map((rule) => [rule.id, rule.confidenceThreshold]),
  )
  const selected = new Set<string>(
    input.decisions
      .filter((decision) => {
        const threshold = thresholds.get(decision.ruleId)
        return (
          threshold !== undefined &&
          decision.applies &&
          decision.confidence >= threshold
        )
      })
      .map((decision) => decision.ruleId),
  )
  const add = new Set<string>()
  const remove = new Set<string>()

  for (const rule of input.rules) {
    if (selected.has(rule.id)) {
      if (!input.currentLabels.has(rule.label)) add.add(rule.label)
    } else if (
      rule.mode === "reconcile" &&
      input.currentLabels.has(rule.label)
    ) {
      remove.add(rule.label)
    }
  }

  return {
    selectedRuleIds: input.decisions
      .filter((decision) => selected.has(decision.ruleId))
      .map((decision) => decision.ruleId),
    selectedLabels: input.rules
      .filter((rule) => selected.has(rule.id))
      .map((rule) => rule.label),
    changes: { add: [...add], remove: [...remove] },
  }
}
