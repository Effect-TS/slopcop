import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import { planLabelActions } from "@slopcop/labeling/LabelActions"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
const now = DateTime.fromDateUnsafe(new Date())
const repositoryId = Schema.decodeUnknownSync(
  GitHubRepository.GitHubRepositoryId,
)("repo")
const policyId = Schema.decodeUnknownSync(Policy.LabelingPolicyId)("policy")
const rule = new Rule.LabelingRule({
  id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("rule"),
  repositoryId,
  policyId,
  label: "ready",
  onMatch: "ensure-present",
  onNoMatch: "ensure-absent",
  conflictGroup: null,
  priority: 0,
  enabled: true,
  validationStatus: "valid",
  validatedAt: now,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
describe("label actions", () => {
  it("preserves on abstain and reconciles only explicit NoMatch", () => {
    const base = { confidence: 1, rationale: "test", trace: [] }
    expect(
      planLabelActions(
        [rule],
        new Map([[policyId, { ...base, outcome: "Abstain" }]]),
        new Set(["ready"]),
      )[0]?.action,
    ).toBe("preserve")
    expect(
      planLabelActions(
        [rule],
        new Map([[policyId, { ...base, outcome: "NoMatch" }]]),
        new Set(["ready"]),
      )[0]?.action,
    ).toBe("remove")
  })
  it("selects one deterministic owner in a conflict group", () => {
    const preferred = new Rule.LabelingRule({
      id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("preferred"),
      repositoryId: rule.repositoryId,
      policyId: rule.policyId,
      label: "bug",
      onMatch: rule.onMatch,
      onNoMatch: rule.onNoMatch,
      conflictGroup: "change-kind",
      priority: 0,
      enabled: rule.enabled,
      validationStatus: rule.validationStatus,
      validatedAt: rule.validatedAt,
      version: rule.version,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      deletedAt: rule.deletedAt,
    })
    const secondary = new Rule.LabelingRule({
      id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("secondary"),
      repositoryId: rule.repositoryId,
      policyId: rule.policyId,
      label: "enhancement",
      onMatch: rule.onMatch,
      onNoMatch: rule.onNoMatch,
      conflictGroup: "change-kind",
      priority: 10,
      enabled: rule.enabled,
      validationStatus: rule.validationStatus,
      validatedAt: rule.validatedAt,
      version: rule.version,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      deletedAt: rule.deletedAt,
    })
    const result = planLabelActions(
      [secondary, preferred],
      new Map([
        [
          policyId,
          { outcome: "Match", confidence: 1, rationale: "test", trace: [] },
        ],
      ]),
      new Set(["enhancement"]),
    )
    expect(result).toMatchObject([
      { label: "enhancement", action: "remove" },
      { label: "bug", action: "add" },
    ])
  })
})
