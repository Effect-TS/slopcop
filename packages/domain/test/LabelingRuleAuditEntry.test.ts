import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"

describe("LabelingRuleAuditEntry", () => {
  it("decodes persisted audit JSON written before display fields existed", () => {
    const entry = Schema.decodeUnknownSync(
      LabelingRuleAuditEntry.LabelingRuleAuditEntry.select,
    )({
      id: "audit-1",
      repositoryId: "repo-1",
      ruleId: "rule-1",
      actor: "admin:legacy",
      operation: "update",
      before: JSON.stringify({
        id: "rule-1",
        repositoryId: "repo-1",
        label: "bug",
        instructions: "Apply to bugs.",
        mode: "add-only",
        exclusiveGroup: null,
        enabled: true,
        validationStatus: "valid",
        validatedAt: null,
        version: 1,
      }),
      after: "null",
      createdAt: 1_754_956_800_000,
    })

    expect(entry.before).toMatchObject({
      id: "rule-1",
      label: "bug",
      instructions: "Apply to bugs.",
    })
    expect(entry.before).not.toHaveProperty("name")
  })
})
