import * as Management from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
describe("generic label bindings", () => {
  it("binds a policy with explicit match and non-match behavior", () => {
    expect(
      Schema.is(Management.CreateLabelingRuleRequest)({
        _tag: "PolicyLabelingRule",
        policyId: "policy-1",
        label: "ready",
        onMatch: "ensure-present",
        onNoMatch: "ensure-absent",
        enabled: true,
      }),
    ).toBe(true)
  })
  it("requires optimistic versioning for changes", () => {
    expect(
      Schema.is(Management.PatchLabelingRuleRequest)({
        _tag: "PolicyLabelingRule",
        onNoMatch: "preserve",
        version: 2,
      }),
    ).toBe(true)
    expect(
      Schema.is(Management.PatchLabelingRuleRequest)({
        _tag: "PolicyLabelingRule",
        onNoMatch: "preserve",
      }),
    ).toBe(false)
  })

  it("models AI rules without policy-only state", () => {
    expect(
      Schema.is(Management.CreateLabelingRuleRequest)({
        _tag: "AiLabelingRule",
        prompt: "Classify this pull request.",
        evidence: ["pull_request.title"],
        minimumConfidence: 0.8,
        evaluator: "boolean-policy-v1",
        gatePolicyId: null,
        label: "bug",
        onMatch: "ensure-present",
        onNoMatch: "preserve",
        enabled: true,
      }),
    ).toBe(true)
    expect(
      Schema.is(Management.CreateLabelingRuleRequest)({
        _tag: "AiLabelingRule",
        policyId: "policy-1",
        label: "bug",
        onMatch: "ensure-present",
        onNoMatch: "preserve",
        enabled: true,
      }),
    ).toBe(false)
  })
})
