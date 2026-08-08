import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  validateLabelingRuleDeletion,
  validateLabelingRuleSet,
} from "../src/LabelingRuleCommands.ts"

const now = DateTime.fromDateUnsafe(new Date("2026-08-08T00:00:00Z"))
const repositoryId = Schema.decodeUnknownSync(
  GitHubRepository.GitHubRepositoryId,
)("repository-1")

const makeRule = (
  id: string,
  overrides: Partial<{
    label: string
    kind: "ai" | "ready-for-review"
    mode: "add-only" | "reconcile"
    exclusiveGroup: string | null
    enabled: boolean
    validationStatus: "valid" | "missing" | "unknown"
  }> = {},
) =>
  new LabelingRule.LabelingRule({
    id: Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)(id),
    repositoryId,
    name: `Rule ${id}`,
    label: overrides.label ?? id,
    kind: overrides.kind ?? "ai",
    instructions: "Apply this rule.",
    confidenceThreshold: 0.8,
    mode: overrides.mode ?? "add-only",
    exclusiveGroup: overrides.exclusiveGroup ?? null,
    enabled: overrides.enabled ?? true,
    validationStatus: overrides.validationStatus ?? "valid",
    validatedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: Option.none(),
  })

const candidate = (
  overrides: {
    readonly label?: string
    readonly kind?: "ai" | "ready-for-review"
    readonly mode?: "add-only" | "reconcile"
    readonly exclusiveGroup?: string | null
    readonly enabled?: boolean
    readonly validationStatus?: "valid" | "missing" | "unknown"
  } = {},
) => ({
  label: overrides.label ?? "feature",
  kind: overrides.kind ?? "ai",
  mode: overrides.mode ?? "add-only",
  exclusiveGroup: overrides.exclusiveGroup ?? null,
  enabled: overrides.enabled ?? true,
  validationStatus: overrides.validationStatus ?? "valid",
})

describe("labeling rule mutation invariants", () => {
  it.effect("allows an edit to retain its own label", () => {
    const current = makeRule("rule-1", { label: "bug" })
    return validateLabelingRuleSet(
      [current],
      "Effect-TS/effect",
      candidate({ label: "bug" }),
      current.id,
    )
  })

  it.effect("rejects duplicate labels case-insensitively", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleSet(
          [makeRule("rule-1", { label: "Bug" })],
          "Effect-TS/effect",
          candidate({ label: "bug" }),
        ),
      )
      expect(error).toMatchObject({
        _tag: "DuplicateLabelingRule",
        label: "bug",
      })
    }),
  )

  it.effect("rejects enabling an invalid rule", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleSet(
          [],
          "Effect-TS/effect",
          candidate({ enabled: true, validationStatus: "missing" }),
        ),
      )
      expect(error.message).toBe(
        "An enabled labeling rule must have a valid GitHub label.",
      )
    }),
  )

  it.effect("rejects a fifty-first enabled rule", () =>
    Effect.gen(function* () {
      const existing = Array.from({ length: 50 }, (_, index) =>
        makeRule(`rule-${index}`),
      )
      const error = yield* Effect.flip(
        validateLabelingRuleSet(existing, "Effect-TS/effect", candidate()),
      )
      expect(error.message).toBe(
        "A repository may have at most 50 enabled labeling rules.",
      )
    }),
  )

  it.effect("requires reconcile mode for ready-for-review rules", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleSet(
          [],
          "Effect-TS/effect",
          candidate({ kind: "ready-for-review", mode: "add-only" }),
        ),
      )
      expect(error.message).toBe(
        "Ready-for-review rules must use reconcile mode.",
      )
    }),
  )

  it.effect("requires one mode within an exclusive group", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleSet(
          [
            makeRule("rule-1", {
              mode: "reconcile",
              exclusiveGroup: "type",
            }),
          ],
          "Effect-TS/effect",
          candidate({ mode: "add-only", exclusiveGroup: "type" }),
        ),
      )
      expect(error.message).toBe(
        "Rules in exclusive group 'type' must use the same mode.",
      )
    }),
  )

  it.effect("requires a rule to be disabled before deletion", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleDeletion(makeRule("rule-1")),
      )
      expect(error.message).toBe(
        "Disable the labeling rule before deleting it.",
      )
      yield* validateLabelingRuleDeletion(
        makeRule("rule-2", { enabled: false }),
      )
    }),
  )
})
