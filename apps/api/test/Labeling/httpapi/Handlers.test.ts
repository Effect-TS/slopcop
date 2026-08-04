import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
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
  label: "bug",
  kind: "ai",
  instructions: "The pull request fixes a defect.",
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
    label: rule.label,
    instructions: rule.instructions,
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
})
