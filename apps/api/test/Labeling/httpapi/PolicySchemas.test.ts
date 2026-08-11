import * as Management from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"

const condition = {
  _tag: "FactPredicate",
  fact: "pull_request.draft",
  operator: "Equals",
  value: false,
} as const

describe("policy request schemas", () => {
  it("accepts a generic pull request policy", () => {
    const request = Schema.decodeUnknownSync(Management.CreatePolicyRequest)({
      name: "Ready",
      target: "pull_request",
      program: {
        target: "pull_request",
        matchesWhen: condition,
      },
      metadata: { description: "Ready pull requests" },
    })
    expect(request.program.matchesWhen).toEqual(condition)
    expect(request.program.appliesWhen).toBeNull()
  })

  it("rejects capability-specific fields", () => {
    expect(() =>
      Schema.decodeUnknownSync(Management.CreatePolicyRequest)({
        name: "Legacy",
        kind: "ai",
        outputs: [],
      }),
    ).toThrow()
  })

  it("accepts a pinned published policy reference", () => {
    const request = Schema.decodeUnknownSync(Management.CreatePolicyRequest)({
      name: "Composed policy",
      target: "pull_request",
      program: {
        target: "pull_request",
        matchesWhen: {
          _tag: "PolicyReference",
          policyVersionId: "published-version-1",
        },
      },
      metadata: {},
    })

    expect(request.program.matchesWhen).toEqual({
      _tag: "PolicyReference",
      policyVersionId: "published-version-1",
    })
  })
})
