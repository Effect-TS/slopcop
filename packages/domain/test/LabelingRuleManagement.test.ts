import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"

describe("TestLabelingRuleRequest", () => {
  const isRequest = Schema.is(LabelingRuleManagement.TestLabelingRuleRequest)

  it("requires a positive integer pull request number", () => {
    expect(isRequest({ pullRequestNumber: 1 })).toBe(true)
    expect(isRequest({ pullRequestNumber: 0 })).toBe(false)
    expect(isRequest({ pullRequestNumber: -1 })).toBe(false)
    expect(isRequest({ pullRequestNumber: 1.5 })).toBe(false)
    expect(isRequest({})).toBe(false)
  })
})

describe("labeling rule mutation requests", () => {
  it("accepts every field required to create a tabular rule", () => {
    expect(
      Schema.is(LabelingRuleManagement.CreateLabelingRuleRequest)({
        name: "Ready for review",
        label: "ready",
        kind: "ready-for-review",
        instructions: "Apply when the pull request is ready.",
        confidenceThreshold: 0.9,
        mode: "reconcile",
        exclusiveGroup: "review-state",
        enabled: true,
      }),
    ).toBe(true)
  })

  it("accepts a versioned edit of every mutable field", () => {
    expect(
      Schema.is(LabelingRuleManagement.PatchLabelingRuleRequest)({
        name: "Defects",
        label: "bug",
        kind: "ai",
        instructions: "Apply to defect fixes.",
        confidenceThreshold: 0.75,
        mode: "add-only",
        exclusiveGroup: null,
        enabled: false,
        version: 4,
      }),
    ).toBe(true)
  })

  it("supports versioned enable and disable toggles through PATCH", () => {
    const isPatch = Schema.is(LabelingRuleManagement.PatchLabelingRuleRequest)
    expect(isPatch({ enabled: true, version: 2 })).toBe(true)
    expect(isPatch({ enabled: false, version: 2 })).toBe(true)
    expect(isPatch({ enabled: false })).toBe(false)
  })

  it("requires a version for delete concurrency", () => {
    const isDelete = Schema.is(LabelingRuleManagement.RuleVersionQuery)
    expect(isDelete({ version: 3 })).toBe(true)
    expect(isDelete({})).toBe(false)
  })
})
