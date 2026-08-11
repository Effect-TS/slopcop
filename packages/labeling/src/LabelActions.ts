import type * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
export interface LabelAction {
  readonly ruleId: Rule.LabelingRule["id"]
  readonly label: Rule.LabelingRule["label"]
  readonly action: "add" | "remove" | "preserve"
  readonly selected: boolean
}
export const planLabelActions = (
  rules: ReadonlyArray<Rule.LabelingRule>,
  decisions: ReadonlyMap<string, Program.PolicyEvaluationResult>,
  currentLabels: ReadonlySet<string>,
): ReadonlyArray<LabelAction> => {
  const winners = new Map<string, Rule.LabelingRule["id"]>()
  const grouped = new Map<string, Array<Rule.LabelingRule>>()
  for (const rule of rules) {
    const decision = decisions.get(rule.policyId)
    if (
      rule.conflictGroup !== null &&
      rule.enabled &&
      rule.validationStatus === "valid" &&
      decision?.outcome === "Match"
    ) {
      const group = grouped.get(rule.conflictGroup) ?? []
      group.push(rule)
      grouped.set(rule.conflictGroup, group)
    }
  }
  for (const [group, candidates] of grouped) {
    const winner = [...candidates].sort(
      (left, right) =>
        left.priority - right.priority || left.id.localeCompare(right.id),
    )[0]
    if (winner !== undefined) winners.set(group, winner.id)
  }
  return rules.map((rule) => {
    const decision = decisions.get(rule.policyId)
    if (
      !rule.enabled ||
      rule.validationStatus !== "valid" ||
      decision === undefined ||
      decision.outcome === "Abstain"
    )
      return {
        ruleId: rule.id,
        label: rule.label,
        action: "preserve",
        selected: false,
      }
    const selected =
      decision.outcome === "Match" &&
      (rule.conflictGroup === null ||
        winners.get(rule.conflictGroup) === rule.id)
    if (selected)
      return {
        ruleId: rule.id,
        label: rule.label,
        action: currentLabels.has(rule.label) ? "preserve" : "add",
        selected: true,
      }
    const conflictingLoser =
      rule.conflictGroup !== null && winners.has(rule.conflictGroup)
    return {
      ruleId: rule.id,
      label: rule.label,
      action:
        (conflictingLoser || rule.onNoMatch === "ensure-absent") &&
        currentLabels.has(rule.label)
          ? "remove"
          : "preserve",
      selected: false,
    }
  })
}
