import * as LabelClassification from "@slopcop/domain/Labeling/LabelClassification"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import { planLabels } from "../../src/Labeling/LabelPolicy.ts"

const decision = (
  ruleId: string,
  applies: boolean,
  confidence: number,
): LabelClassification.RuleDecision => ({
  ruleId: Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)(ruleId),
  applies,
  confidence,
  rationale: "reason",
})

describe("planLabels", () => {
  it("adds confident selections and removes only unselected reconcile labels", () => {
    const { changes } = planLabels({
      rules: [
        { id: "v3", label: "3.0", mode: "reconcile" },
        { id: "v4", label: "4.0", mode: "reconcile" },
        { id: "bug", label: "bug", mode: "add-only" },
      ],
      decisions: [
        decision("v3", false, 0.95),
        decision("v4", true, 0.95),
        decision("bug", false, 0.95),
      ],
      currentLabels: new Set(["3.0", "bug", "maintainer-owned"]),
      confidenceThreshold: 0.75,
    })

    expect(changes).toEqual({ add: ["4.0"], remove: ["3.0"] })
  })

  it("treats a below-threshold applicable decision as unselected", () => {
    const { changes } = planLabels({
      rules: [
        { id: "v4", label: "4.0", mode: "reconcile" },
        { id: "enhancement", label: "enhancement", mode: "add-only" },
      ],
      decisions: [
        decision("v4", true, 0.74),
        decision("enhancement", true, 0.74),
      ],
      currentLabels: new Set(["4.0", "enhancement", "unmanaged"]),
      confidenceThreshold: 0.75,
    })

    expect(changes).toEqual({ add: [], remove: ["4.0"] })
  })

  it("is idempotent when current labels already match", () => {
    const { changes } = planLabels({
      rules: [{ id: "bug", label: "bug", mode: "add-only" }],
      decisions: [decision("bug", true, 0.75)],
      currentLabels: new Set(["bug", "unmanaged"]),
      confidenceThreshold: 0.75,
    })

    expect(changes).toEqual({ add: [], remove: [] })
  })
})
