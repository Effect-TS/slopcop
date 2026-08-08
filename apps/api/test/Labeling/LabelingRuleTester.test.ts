import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { GitHubAppAuth } from "@slopcop/github/GitHubAppAuth"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { LabelClassifier } from "@slopcop/labeling/LabelClassifier"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { LabelingRuleTester } from "../../src/Labeling/LabelingRuleTester.ts"

const now = DateTime.fromDateUnsafe(new Date("2026-08-08T00:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)("repo-1"),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("2"),
  owner: "Effect-TS",
  repo: "effect",
  isPrivate: false,
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("3"),
  enabled: true,
  rulesRevision: 4,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})

const makeRule = (kind: "ai" | "ready-for-review") =>
  new LabelingRule.LabelingRule({
    id: Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)(`rule-${kind}`),
    repositoryId: repository.id,
    name: kind,
    label: kind === "ai" ? "bug" : "ready",
    kind,
    instructions: "Apply this rule.",
    confidenceThreshold: 0.8,
    mode: "reconcile",
    exclusiveGroup: null,
    enabled: true,
    validationStatus: "valid",
    validatedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: Option.none(),
  })

const unavailable = Effect.die("Unexpected test service call")
const unavailableStream = Stream.die("Unexpected test stream call")

const makeLayer = (
  rule: LabelingRule.LabelingRule,
  state: {
    writes: number
    classifiedRuleIds: Array<string>
    confidence?: number
    currentLabels?: ReadonlyArray<string>
    generatedRelease?: boolean
  },
) =>
  LabelingRuleTester.layerNoDeps.pipe(
    Layer.provide([
      Layer.succeed(LabelingRules, {
        list: () => unavailable,
        get: () => Effect.succeed(rule),
        listAudit: () => unavailable,
        listActivity: () => unavailable,
        create: () => unavailable,
        update: () => unavailable,
        revalidate: () => unavailable,
        disable: () => unavailable,
        remove: () => unavailable,
        getActiveSnapshot: () => unavailable,
        assertRevision: () => unavailable,
        listAvailableLabels: () => unavailable,
        validateCandidateLabel: () => unavailable,
        markMissing: () => unavailable,
        revalidateStaleBatch: () => unavailable,
      }),
      Layer.succeed(GitHubRepositoriesRepo, {
        list: () => unavailable,
        findBySlug: () => Effect.succeed(Option.some(repository)),
        findByGitHubId: () => unavailable,
        findById: () => unavailable,
        getRulesRevision: () => unavailable,
        incrementRulesRevision: () => unavailable,
        updateEnabled: () => unavailable,
        replaceInstallationRepositories: () => unavailable,
      }),
      Layer.succeed(GitHubClient, {
        getRepositoryLabel: () => unavailable,
        listRepositoryLabels: () => unavailableStream,
        getPullRequest: () =>
          Effect.succeed({
            number: 42,
            title: state.generatedRelease ? "Version Packages" : "Fix defect",
            body: state.generatedRelease
              ? "This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action.\n\n# Releases"
              : "Fixes a defect.",
            draft: false,
            head: { sha: "abc" },
            base: { ref: "main" },
          }),
        listPullRequestFiles: () =>
          Stream.fromIterable([
            {
              filename: state.generatedRelease
                ? "packages/effect/CHANGELOG.md"
                : ".changeset/fix.md",
              status: (state.generatedRelease ? "modified" : "added") as
                | "modified"
                | "added",
              patch: "patch",
            },
          ]),
        listOpenPullRequests: () => unavailable,
        listItemLabels: () =>
          Stream.fromIterable(
            (state.currentLabels ?? []).map((name) => ({
              name,
              description: null,
              color: "ffffff",
            })),
          ),
        addItemLabels: () =>
          Effect.sync(() => {
            state.writes++
            return []
          }),
        removeItemLabel: () =>
          Effect.sync(() => {
            state.writes++
            return true
          }),
        listPullRequestsForCommit: () => unavailable,
        listPullRequestReviews: () => Effect.succeed([]),
        getFileContent: () =>
          Effect.succeed('---\n"effect": patch\n---\nFix defect.\n'),
        listRequiredChecks: () => Effect.succeed([]),
        listCheckRuns: () => Effect.succeed([]),
        listCommitStatuses: () => Effect.succeed([]),
      }),
      Layer.succeed(LabelClassifier, (input) => {
        state.classifiedRuleIds.push(
          ...input.ruleSet.rules.map((item) => item.id),
        )
        return Effect.succeed({
          rulesRevision: input.ruleSet.revision,
          decisions: input.ruleSet.rules.map((item) => ({
            ruleId: item.id,
            applies: true,
            confidence: state.confidence ?? 0.95,
            rationale: "The evidence matches the configured rule.",
          })),
        })
      }),
      Layer.succeed(GitHubAppAuth, {
        appId: 999,
        getAppToken: () => unavailable,
        getInstallationToken: () => unavailable,
      }),
    ]),
  )

describe("LabelingRuleTester", () => {
  it.effect("tests only the requested AI rule without writing labels", () => {
    const state = { writes: 0, classifiedRuleIds: [] as Array<string> }
    const rule = makeRule("ai")
    return Effect.gen(function* () {
      const tester = yield* LabelingRuleTester
      const result = yield* tester.test(repository, rule.id, 42)

      expect(result).toEqual({
        ruleId: rule.id,
        pullRequestNumber: 42,
        applies: true,
        selected: true,
        confidence: 0.95,
        confidenceThreshold: 0.8,
        rationale: "The evidence matches the configured rule.",
        proposedLabelChanges: { add: ["bug"], remove: [] },
      })
      expect(state.classifiedRuleIds).toEqual([rule.id])
      expect(state.writes).toBe(0)
    }).pipe(Effect.provide(makeLayer(rule, state)))
  })

  it.effect(
    "reports an applicable below-threshold result as unselected",
    () => {
      const state = {
        writes: 0,
        classifiedRuleIds: [] as Array<string>,
        confidence: 0.7,
      }
      const rule = makeRule("ai")
      return Effect.gen(function* () {
        const tester = yield* LabelingRuleTester
        const result = yield* tester.test(repository, rule.id, 42)

        expect(result).toMatchObject({
          applies: true,
          selected: false,
          proposedLabelChanges: { add: [], remove: [] },
        })
      }).pipe(Effect.provide(makeLayer(rule, state)))
    },
  )

  it.effect("tests a ready-for-review rule without AI or label writes", () => {
    const state = { writes: 0, classifiedRuleIds: [] as Array<string> }
    const rule = makeRule("ready-for-review")
    return Effect.gen(function* () {
      const tester = yield* LabelingRuleTester
      const result = yield* tester.test(repository, rule.id, 42)

      expect(result.applies).toBe(true)
      expect(result.selected).toBe(true)
      expect(result.confidence).toBe(1)
      expect(result.proposedLabelChanges).toEqual({
        add: ["ready"],
        remove: [],
      })
      expect(state.classifiedRuleIds).toEqual([])
      expect(state.writes).toBe(0)
    }).pipe(Effect.provide(makeLayer(rule, state)))
  })

  it.effect(
    "proposes no reconciliation for generated Changesets releases",
    () => {
      const state = {
        writes: 0,
        classifiedRuleIds: [] as Array<string>,
        generatedRelease: true,
        currentLabels: ["ready"],
      }
      const rule = makeRule("ready-for-review")
      return Effect.gen(function* () {
        const tester = yield* LabelingRuleTester
        const result = yield* tester.test(repository, rule.id, 42)

        expect(result).toMatchObject({
          applies: false,
          selected: false,
          proposedLabelChanges: { add: [], remove: [] },
        })
      }).pipe(Effect.provide(makeLayer(rule, state)))
    },
  )
})
