import * as Management from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
describe("generic label bindings", () => {
  it("binds a policy with explicit match and non-match behavior", () => {
    expect(
      Schema.is(Management.CreateLabelingRuleRequest)({
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
        onNoMatch: "preserve",
        version: 2,
      }),
    ).toBe(true)
    expect(
      Schema.is(Management.PatchLabelingRuleRequest)({ onNoMatch: "preserve" }),
    ).toBe(false)
  })
})
