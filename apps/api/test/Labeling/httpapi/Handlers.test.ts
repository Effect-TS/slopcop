import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import * as Audit from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import {
  LabelingRuleConflict,
  StaleLabelingRulesRevision,
} from "@slopcop/labeling/LabelingRuleErrors"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  formatAuditCursor,
  mapRuleError,
  parseAuditCursor,
  toPublicAuditEntry,
  toPublicRule,
} from "../../../src/Labeling/httpapi/Handlers.ts"
const now = DateTime.fromDateUnsafe(new Date("2026-08-10T00:00:00Z"))
const repositoryId = Schema.decodeUnknownSync(
  GitHubRepository.GitHubRepositoryId,
)("repo")
const policyId = Schema.decodeUnknownSync(Policy.LabelingPolicyId)("policy")
const rule = new Rule.PolicyLabelingRule({
  _tag: "PolicyLabelingRule",
  id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("rule"),
  repositoryId,
  policyId,
  label: "bug",
  onMatch: "ensure-present",
  onNoMatch: "preserve",
  conflictGroup: "change-kind",
  priority: 1,
  enabled: true,
  validationStatus: "valid",
  validatedAt: now,
  version: 2,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const policy = new Policy.LabelingPolicy({
  id: policyId,
  repositoryId,
  name: "Bug policy",
  target: "pull_request",
  publishedVersionId: Schema.decodeUnknownSync(Program.PolicyVersionId)(
    "version",
  ),
  version: 2,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const aiRule = new Rule.AiLabelingRule({
  _tag: "AiLabelingRule",
  id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("ai-rule"),
  repositoryId,
  prompt: "Classify bugs.",
  evidence: ["pull_request.title"],
  minimumConfidence: 0.8,
  evaluator: "boolean-policy-v1",
  gatePolicyId: null,
  label: "bug",
  onMatch: "ensure-present",
  onNoMatch: "preserve",
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
describe("generic labeling HTTP projections", () => {
  it.effect("projects policy-bound rules without repository internals", () =>
    Effect.gen(function* () {
      const value = yield* toPublicRule(rule, policy)
      expect(value).toMatchObject({
        id: "rule",
        policyId: "policy",
        conflictGroup: "change-kind",
        policy: { name: "Bug policy", published: true },
      })
      expect(value).not.toHaveProperty("repositoryId")
    }),
  )

  it.effect("projects AI rules without a synthetic policy", () =>
    Effect.gen(function* () {
      expect(yield* toPublicRule(aiRule, null)).toMatchObject({
        _tag: "AiLabelingRule",
        prompt: "Classify bugs.",
        gatePolicyId: null,
        gatePolicy: null,
      })
    }),
  )

  it.effect("projects generic audit snapshots", () =>
    Effect.gen(function* () {
      const entry = new Audit.LabelingRuleAuditEntry({
        id: Schema.decodeUnknownSync(Audit.LabelingRuleAuditEntryId)("audit"),
        repositoryId,
        ruleId: rule.id,
        actor: "admin:test",
        operation: "update",
        before: null,
        after: {
          _tag: "PolicyLabelingRule",
          id: rule.id,
          repositoryId,
          policyId,
          label: "bug",
          onMatch: "ensure-present",
          onNoMatch: "preserve",
          conflictGroup: "change-kind",
          priority: 1,
          enabled: true,
          validationStatus: "valid",
          validatedAt: now,
          version: 2,
        },
        createdAt: now,
      })
      expect(yield* toPublicAuditEntry(entry)).toMatchObject({
        ruleId: "rule",
        after: { policyId: "policy", priority: 1 },
      })
    }),
  )

  it.effect("preserves readable legacy audit snapshots", () =>
    Effect.gen(function* () {
      const entry = new Audit.LabelingRuleAuditEntry({
        id: Schema.decodeUnknownSync(Audit.LabelingRuleAuditEntryId)("legacy"),
        repositoryId,
        ruleId: null,
        actor: "admin:test",
        operation: "delete",
        before: {
          id: rule.id,
          repositoryId,
          name: "Bug",
          label: "bug",
          kind: "ai",
          instructions: "Legacy",
          confidenceThreshold: 0.8,
          mode: "add-only",
          exclusiveGroup: "change-kind",
          enabled: false,
          validationStatus: "valid",
          validatedAt: now,
          version: 1,
        },
        after: null,
        createdAt: now,
      })
      expect(yield* toPublicAuditEntry(entry)).toMatchObject({
        before: { kind: "ai", instructions: "Legacy" },
      })
    }),
  )

  it.effect("round-trips audit cursors", () =>
    Effect.gen(function* () {
      const encoded = yield* formatAuditCursor({ createdAt: 42, id: "audit" })
      expect(encoded).toBe("42:audit")
      expect(yield* parseAuditCursor(encoded ?? undefined)).toEqual({
        createdAt: 42,
        id: "audit",
      })
    }),
  )

  it.effect("retains current state in version and revision conflicts", () =>
    Effect.gen(function* () {
      const encode = (current: Rule.LabelingRule) =>
        toPublicRule(current, policy)
      const conflict = yield* Effect.flip(
        mapRuleError(
          new LabelingRuleConflict({
            repository: "o/r",
            ruleId: rule.id,
            currentRule: rule,
          }),
          encode,
        ),
      )
      expect(conflict).toMatchObject({
        _tag: "LabelingRuleConflict",
        currentRule: { version: 2 },
      })
      const revision = yield* Effect.flip(
        mapRuleError(
          new StaleLabelingRulesRevision({
            repository: "o/r",
            expectedRevision: 1,
            actualRevision: 2,
            currentRule: rule,
          }),
          encode,
        ),
      )
      expect(revision).toMatchObject({
        _tag: "LabelingRulesRevisionConflict",
        currentRule: { id: "rule" },
      })
    }),
  )
})
