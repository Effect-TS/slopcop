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
