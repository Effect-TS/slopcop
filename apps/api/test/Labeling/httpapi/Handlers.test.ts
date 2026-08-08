import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
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
  mapRuleError,
  toPublicAuditEntry,
  toPublicRule,
} from "../../../src/Labeling/httpapi/Handlers.ts"

const timestamp = "2026-07-28T11:06:31.000Z"
const now = DateTime.fromDateUnsafe(new Date(timestamp))

const rule = new LabelingRule.LabelingRule({
  id: Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)("rule-1"),
  repositoryId: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)(
    "repository-1",
  ),
  name: "Bug fixes",
  label: "bug",
  kind: "ai",
  instructions: "The pull request fixes a defect.",
  confidenceThreshold: 0.75,
  mode: "add-only",
  exclusiveGroup: null,
  enabled: true,
  validationStatus: "valid",
  validatedAt: now,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})

const deletedAuditEntry = new LabelingRuleAuditEntry.LabelingRuleAuditEntry({
  id: Schema.decodeUnknownSync(LabelingRuleAuditEntry.LabelingRuleAuditEntryId)(
    "audit-1",
  ),
  repositoryId: rule.repositoryId,
  ruleId: null,
  actor: "admin:cloudflare-access:max@example.com",
  operation: "delete",
  before: {
    id: rule.id,
    repositoryId: rule.repositoryId,
    name: rule.name,
    label: rule.label,
    kind: rule.kind,
    instructions: rule.instructions,
    confidenceThreshold: rule.confidenceThreshold,
    mode: rule.mode,
    exclusiveGroup: rule.exclusiveGroup,
    enabled: false,
    validationStatus: rule.validationStatus,
    validatedAt: rule.validatedAt,
    version: 2,
  },
  after: null,
  createdAt: now,
})

describe("labeling rule HTTP serialization", () => {
  it.effect("encodes database timestamps as public ISO strings", () =>
    Effect.gen(function* () {
      const publicRule = yield* toPublicRule(rule)
      const encoded = yield* Schema.encodeEffect(
        LabelingRuleManagement.PublicLabelingRule,
      )(publicRule)

      expect(encoded).toMatchObject({
        validatedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      expect(encoded).not.toHaveProperty("repositoryId")
      expect(encoded).not.toHaveProperty("deletedAt")
    }),
  )

  it.effect(
    "preserves deleted-rule identity without exposing repository IDs",
    () =>
      Effect.gen(function* () {
        const publicEntry = yield* toPublicAuditEntry(deletedAuditEntry)
        const encoded = yield* Schema.encodeEffect(
          LabelingRuleManagement.PublicLabelingRuleAuditEntry,
        )(publicEntry)

        expect(encoded).toMatchObject({
          ruleId: "rule-1",
          operation: "delete",
          createdAt: timestamp,
          before: { id: "rule-1", label: "bug" },
          after: null,
        })
        expect(encoded.before).not.toHaveProperty("repositoryId")
      }),
  )

  it.effect("preserves the current rule in stale version errors", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        mapRuleError(
          new LabelingRuleConflict({
            repository: "Effect-TS/effect",
            ruleId: rule.id,
            currentRule: rule,
          }),
        ),
      )

      expect(error).toMatchObject({
        _tag: "LabelingRuleConflict",
        ruleId: "rule-1",
        currentRule: { id: "rule-1", version: 1 },
      })
      if (error._tag !== "LabelingRuleConflict")
        return yield* Effect.die("Expected a rule version conflict")
      expect(error.currentRule).not.toHaveProperty("repositoryId")
    }),
  )

  it.effect("preserves the current rule in stale revision errors", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        mapRuleError(
          new StaleLabelingRulesRevision({
            repository: "Effect-TS/effect",
            expectedRevision: 3,
            actualRevision: 4,
            currentRule: rule,
          }),
        ),
      )

      expect(error).toMatchObject({
        _tag: "LabelingRulesRevisionConflict",
        repository: "Effect-TS/effect",
        expectedRevision: 3,
        actualRevision: 4,
        currentRule: { id: "rule-1", version: 1 },
      })
      if (error._tag !== "LabelingRulesRevisionConflict")
        return yield* Effect.die("Expected a rules revision conflict")
      expect(error.currentRule).not.toHaveProperty("repositoryId")
    }),
  )

  it.effect("uses a null current rule for create revision conflicts", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        mapRuleError(
          new StaleLabelingRulesRevision({
            repository: "Effect-TS/effect",
            expectedRevision: 3,
            actualRevision: 4,
            currentRule: null,
          }),
        ),
      )

      expect(error).toMatchObject({
        _tag: "LabelingRulesRevisionConflict",
        currentRule: null,
      })
    }),
  )
})
