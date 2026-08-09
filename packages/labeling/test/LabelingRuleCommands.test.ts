import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import {
  makeLabelingRuleCommands,
  validateLabelingRuleDeletion,
  validateLabelingRuleSet,
} from "../src/LabelingRuleCommands.ts"
import { LabelingRuleAuditLogRepo } from "../src/repositories/LabelingRuleAuditLogRepo.ts"
import { LabelingRulesRepo } from "../src/repositories/LabelingRulesRepo.ts"

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
  it.effect("executes create without a SqlClient service", () => {
    const input = LabelingRule.LabelingRule.insert.make({
      repositoryId,
      name: "Feature rule",
      label: "feature",
      kind: "ai",
      instructions: "Apply this rule.",
      confidenceThreshold: 0.8,
      mode: "add-only",
      exclusiveGroup: null,
      enabled: true,
      validationStatus: "valid",
      validatedAt: now,
      version: 1,
    })
    const stored = new LabelingRule.LabelingRule({
      ...input,
      id: Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)("rule-1"),
      createdAt: now,
      updatedAt: now,
      deletedAt: Option.none(),
    })
    const inserted: Array<typeof LabelingRule.LabelingRule.insert.Type> = []
    const revisions: Array<{
      readonly repositoryId: GitHubRepository.GitHubRepository["id"]
      readonly expectedRevision: number
    }> = []
    const audits: Array<
      typeof LabelingRuleAuditEntry.LabelingRuleAuditEntry.insert.Type
    > = []

    const layer = Layer.mergeAll(
      Layer.succeed(GitHubRepositoriesRepo, {
        list: () => Effect.die("Unexpected repository list"),
        findBySlug: () => Effect.die("Unexpected repository lookup"),
        findByGitHubId: () => Effect.die("Unexpected repository lookup"),
        findById: () => Effect.die("Unexpected repository lookup"),
        getRulesRevision: () => Effect.succeed(2),
        incrementRulesRevision: (id, expectedRevision) =>
          Effect.sync(() => {
            revisions.push({ repositoryId: id, expectedRevision })
            return expectedRevision + 1
          }),
        updateEnabled: () => Effect.die("Unexpected repository update"),
        replaceInstallationRepositories: () =>
          Effect.die("Unexpected repository replacement"),
      }),
      Layer.succeed(LabelingRulesRepo, {
        listByRepository: () => Effect.succeed([]),
        findById: () => Effect.die("Unexpected rule lookup"),
        findByLabel: () => Effect.die("Unexpected rule lookup"),
        insert: (rule) =>
          Effect.sync(() => {
            inserted.push(rule)
            return stored
          }),
        update: () => Effect.die("Unexpected rule update"),
        remove: () => Effect.die("Unexpected rule removal"),
        listStaleEnabled: () => Effect.die("Unexpected stale rule list"),
      }),
      Layer.succeed(LabelingRuleAuditLogRepo, {
        append: (entry) =>
          Effect.sync(() => {
            audits.push(entry)
            return new LabelingRuleAuditEntry.LabelingRuleAuditEntry({
              ...entry,
              id: Schema.decodeUnknownSync(
                LabelingRuleAuditEntry.LabelingRuleAuditEntryId,
              )("audit-1"),
              createdAt: now,
            })
          }),
        listByRepository: () => Effect.die("Unexpected audit list"),
        listActivity: () => Effect.die("Unexpected activity list"),
      }),
    )

    return Effect.gen(function* () {
      const execute = yield* makeLabelingRuleCommands
      const result = yield* execute(
        {
          _tag: "Create",
          repositoryId,
          repository: "Effect-TS/effect",
          expectedRevision: 2,
          input,
        },
        { _tag: "Administrator", actor: "maxwell" },
      )

      expect(result).toEqual({ _tag: "Stored", rule: stored })
      expect(inserted).toEqual([input])
      expect(revisions).toEqual([{ repositoryId, expectedRevision: 2 }])
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        repositoryId,
        ruleId: stored.id,
        actor: "admin:maxwell",
        operation: "create",
        before: null,
        after: {
          id: stored.id,
          repositoryId,
          version: 1,
        },
      })
    }).pipe(Effect.provide(layer))
  })

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
