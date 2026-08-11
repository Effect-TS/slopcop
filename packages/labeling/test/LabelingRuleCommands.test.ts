import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import {
  validateLabelingRuleDeletion,
  validateLabelingRuleSet,
} from "@slopcop/labeling/LabelingRuleCommands"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const repositoryId = Schema.decodeUnknownSync(
  GitHubRepository.GitHubRepositoryId,
)("repo")
const policyId = Schema.decodeUnknownSync(Policy.LabelingPolicyId)("policy")
const ruleId = Schema.decodeUnknownSync(Rule.LabelingRuleId)
const now = DateTime.fromDateUnsafe(new Date("2026-08-10T00:00:00Z"))
const makeRule = (
  index: number,
  changes: Partial<{
    label: string
    enabled: boolean
    validationStatus: "valid" | "missing" | "unknown"
    conflictGroup: string | null
    onNoMatch: "ensure-absent" | "preserve"
  }> = {},
) =>
  new Rule.LabelingRule({
    id: ruleId(`rule-${index}`),
    repositoryId,
    policyId,
    label: changes.label ?? `label-${index}`,
    onMatch: "ensure-present",
    onNoMatch: changes.onNoMatch ?? "preserve",
    conflictGroup: changes.conflictGroup ?? null,
    priority: index,
    enabled: changes.enabled ?? true,
    validationStatus: changes.validationStatus ?? "valid",
    validatedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: Option.none(),
  })
const candidate = (
  changes: Partial<
    Pick<
      Rule.LabelingRule,
      "label" | "onNoMatch" | "conflictGroup" | "enabled" | "validationStatus"
    >
  > = {},
) => ({
  label: changes.label ?? "new-label",
  onNoMatch: changes.onNoMatch ?? ("preserve" as const),
  conflictGroup: changes.conflictGroup ?? null,
  enabled: changes.enabled ?? true,
  validationStatus: changes.validationStatus ?? ("valid" as const),
})

describe("labeling rule command validation", () => {
  it.effect("rejects labels case-insensitively", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleSet(
          [makeRule(1, { label: "Bug" })],
          "o/r",
          candidate({ label: "bug" }),
        ),
      )
      expect(error._tag).toBe("DuplicateLabelingRule")
    }),
  )

  it.effect("caps enabled bindings at 50", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleSet(
          Array.from({ length: 50 }, (_, index) => makeRule(index)),
          "o/r",
          candidate(),
        ),
      )
      expect(error).toMatchObject({ _tag: "InvalidLabelingRule" })
    }),
  )

  it.effect("allows disabled bindings beyond the enabled cap", () =>
    validateLabelingRuleSet(
      Array.from({ length: 50 }, (_, index) => makeRule(index)),
      "o/r",
      candidate({ enabled: false }),
    ),
  )

  it.effect("rejects enabled bindings with invalid labels", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleSet(
          [],
          "o/r",
          candidate({ validationStatus: "missing" }),
        ),
      )
      expect(error).toMatchObject({ _tag: "InvalidLabelingRule" })
    }),
  )

  it.effect("requires compatible no-match behavior in conflict groups", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateLabelingRuleSet(
          [makeRule(1, { conflictGroup: "kind", onNoMatch: "ensure-absent" })],
          "o/r",
          candidate({ conflictGroup: "kind", onNoMatch: "preserve" }),
        ),
      )
      expect(error).toMatchObject({ _tag: "InvalidLabelingRule" })
    }),
  )

  it.effect("requires disable before delete", () =>
    Effect.gen(function* () {
      expect(
        (yield* Effect.flip(validateLabelingRuleDeletion(makeRule(1))))._tag,
      ).toBe("InvalidLabelingRule")
      yield* validateLabelingRuleDeletion(makeRule(2, { enabled: false }))
    }),
  )
})
