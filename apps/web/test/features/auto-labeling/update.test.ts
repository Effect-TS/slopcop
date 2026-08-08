import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vite-plus/test"
import {
  CompletedRuleTest,
  CompletedSaveRule,
  CompletedToggleRule,
  ConfirmedDeleteRule,
  DismissedRuleTest,
  FailedRuleTest,
  FailedToDeleteRule,
  FailedToSaveRule,
  FailedToToggleRule,
  LoadedRepositoryData,
  LoadedRuleTestCandidates,
  OpenedNewRule,
  OpenedDeleteRule,
  OpenedRuleEditor,
  OpenedRuleTest,
  RanRuleTest,
  ReloadedRuleEditor,
  RetriedDeleteRule,
  RetriedRepositoryLoad,
  RetriedRuleSave,
  RetriedToggleRule,
  SavedRule,
  SelectedRepositoryChanged,
  TestRule,
  ToggledRule,
  UpdatedRuleName,
  init,
  update,
} from "../../../src/features/auto-labeling.ts"

const repository = { owner: "effect", repo: "slopcop" }
const rule = Schema.decodeUnknownSync(
  LabelingRuleManagement.PublicLabelingRule,
)({
  id: "rule-1",
  name: "Documentation patrol",
  label: "documentation",
  kind: "ai",
  instructions: "Apply to documentation changes.",
  confidenceThreshold: 0.8,
  mode: "add-only",
  exclusiveGroup: "change-area",
  enabled: true,
  validationStatus: "valid",
  validatedAt: "2026-08-08T00:00:00.000Z",
  version: 3,
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
})

const loaded = LoadedRepositoryData({
  requestId: 1,
  repository,
  revision: 7,
  rules: [rule],
  activity: {
    windowDays: 30,
    totalFires: 12,
    rules: [{ ruleId: rule.id, fires: 12 }],
  },
  labels: [{ name: "documentation", description: null, color: "0ea5e9" }],
})

const loadedModel = () => {
  const [loading] = update(init(), SelectedRepositoryChanged({ repository }))
  return update(loading, loaded)[0]
}

describe("Auto-labeling update", () => {
  it("loads server data when a repository becomes available", () => {
    const [model, commands] = update(
      init(),
      SelectedRepositoryChanged({ repository }),
    )
    expect(model.repository._tag).toBe("LoadingRepository")
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe("LoadRepositoryData")
  })

  it("creates a draft from server labels and dispatches create", () => {
    const [editing] = update(loadedModel(), OpenedNewRule())
    const [named] = update(
      editing,
      UpdatedRuleName({ name: "Enhancement detector" }),
    )
    const [saving, commands] = update(named, SavedRule())
    expect(saving.editor._tag).toBe("EditorSaving")
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe("SaveRule")
  })

  it("preserves an edited draft after a conflict", () => {
    const [editing] = update(
      loadedModel(),
      OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [named] = update(
      editing,
      UpdatedRuleName({ name: "My unsaved name" }),
    )
    const [saving] = update(named, SavedRule())
    const [failed, commands] = update(
      saving,
      FailedToSaveRule({
        requestId: 2,
        repository,
        message: "The server rule changed.",
        conflict: {
          _tag: "RuleVersionConflict",
          expectedVersion: 3,
          currentRule: { ...rule, version: 4 },
        },
      }),
    )
    expect(commands).toEqual([])
    expect(failed.editor._tag).toBe("EditorConflict")
    if (failed.editor._tag === "EditorConflict") {
      expect(failed.editor.draft.name).toBe("My unsaved name")
      expect(failed.editor.conflict).toMatchObject({
        expectedVersion: 3,
        currentRule: { version: 4 },
      })
    }
  })

  it("retries a conflicted draft only after explicit recovery", () => {
    const [editing] = update(
      loadedModel(),
      OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [named] = update(
      editing,
      UpdatedRuleName({ name: "My unsaved name" }),
    )
    const [saving] = update(named, SavedRule())
    const [conflicted] = update(
      saving,
      FailedToSaveRule({
        requestId: 2,
        repository,
        message: "The server rule changed.",
        conflict: {
          _tag: "RuleVersionConflict",
          expectedVersion: 3,
          currentRule: { ...rule, name: "Server name", version: 4 },
        },
      }),
    )

    const [retrying, commands] = update(conflicted, RetriedRuleSave())
    expect(retrying.editor._tag).toBe("EditorSaving")
    expect(commands[0]?.args).toMatchObject({
      draft: { name: "My unsaved name" },
      version: 4,
    })
  })

  it("reloads current server values only after explicit recovery", () => {
    const [editing] = update(
      loadedModel(),
      OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [saving] = update(editing, SavedRule())
    const currentRule = { ...rule, name: "Server name", version: 4 }
    const [conflicted] = update(
      saving,
      FailedToSaveRule({
        requestId: 2,
        repository,
        message: "The server rule changed.",
        conflict: {
          _tag: "RuleVersionConflict",
          expectedVersion: 3,
          currentRule,
        },
      }),
    )
    const [reloaded, commands] = update(conflicted, ReloadedRuleEditor())
    expect(commands).toEqual([])
    expect(reloaded.editor).toMatchObject({
      _tag: "EditorEditing",
      draft: { name: "Server name" },
      version: 4,
    })
  })

  it("refreshes the table after a repository revision conflict", () => {
    const [editing] = update(
      loadedModel(),
      OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [named] = update(
      editing,
      UpdatedRuleName({ name: "My unsaved name" }),
    )
    const [saving] = update(named, SavedRule())
    const [conflicted, commands] = update(
      saving,
      FailedToSaveRule({
        requestId: 2,
        repository,
        message: "The repository changed.",
        conflict: {
          _tag: "RepositoryRevisionConflict",
          expectedRevision: 7,
          actualRevision: 8,
          currentRule: { ...rule, version: 4 },
        },
      }),
    )
    expect(conflicted.editor).toMatchObject({
      _tag: "EditorConflict",
      draft: { name: "My unsaved name" },
    })
    expect(commands.map((command) => command.name)).toEqual([
      "LoadRepositoryData",
    ])
    const [refreshed] = update(
      conflicted,
      LoadedRepositoryData({
        ...loaded,
        requestId: 3,
        revision: 8,
        rules: [{ ...rule, version: 4 }],
      }),
    )
    expect(refreshed.editor).toMatchObject({
      _tag: "EditorConflict",
      draft: { name: "My unsaved name" },
    })
    if (refreshed.repository._tag === "LoadedRepository") {
      expect(refreshed.repository.data).toMatchObject({
        revision: 8,
        rules: [{ version: 4 }],
      })
    }
  })

  it("accepts only the latest repository load response", () => {
    const [firstLoad] = update(
      init(),
      SelectedRepositoryChanged({ repository }),
    )
    const [secondLoad] = update(firstLoad, RetriedRepositoryLoad())
    const [afterStale] = update(secondLoad, loaded)
    expect(afterStale).toEqual(secondLoad)

    const [afterCurrent] = update(
      afterStale,
      LoadedRepositoryData({ ...loaded, requestId: 2, revision: 8 }),
    )
    expect(afterCurrent.repository._tag).toBe("LoadedRepository")
    if (afterCurrent.repository._tag === "LoadedRepository") {
      expect(afterCurrent.repository.data.revision).toBe(8)
    }
  })

  it("ignores stale save and repository responses", () => {
    const [editing] = update(
      loadedModel(),
      OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [saving] = update(editing, SavedRule())
    const [afterStaleSave, saveCommands] = update(
      saving,
      CompletedSaveRule({ requestId: 99, repository, rule }),
    )
    expect(afterStaleSave).toEqual(saving)
    expect(saveCommands).toEqual([])

    const newerRule = { ...rule, version: 5 }
    const [afterStaleLoad] = update(
      saving,
      LoadedRepositoryData({ ...loaded, requestId: 99, rules: [newerRule] }),
    )
    expect(afterStaleLoad).toEqual(saving)
  })

  it("patches enabled state using the server rule version", () => {
    const [saving, commands] = update(
      loadedModel(),
      ToggledRule({ ruleId: rule.id }),
    )
    expect(saving.rowMutation._tag).toBe("RowMutationSaving")
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe("ToggleRule")
    expect(commands[0]?.args).toMatchObject({
      ruleId: rule.id,
      version: 3,
      enabled: false,
    })
  })

  it("keeps toggle intent and retries a conflict with the current version", () => {
    const [saving] = update(loadedModel(), ToggledRule({ ruleId: rule.id }))
    const [conflicted, conflictCommands] = update(
      saving,
      FailedToToggleRule({
        requestId: 2,
        repository,
        ruleId: rule.id,
        message: "The rule changed.",
        conflict: {
          _tag: "RuleVersionConflict",
          expectedVersion: 3,
          currentRule: { ...rule, version: 4 },
        },
      }),
    )
    expect(conflictCommands).toEqual([])
    expect(conflicted.rowMutation).toMatchObject({
      _tag: "RowMutationConflict",
      enabled: false,
      expectedVersion: 3,
    })
    const [, retryCommands] = update(conflicted, RetriedToggleRule())
    expect(retryCommands[0]?.args).toMatchObject({
      version: 4,
      enabled: false,
    })
  })

  it("ignores stale toggle completions", () => {
    const [saving] = update(loadedModel(), ToggledRule({ ruleId: rule.id }))
    const [unchanged, commands] = update(
      saving,
      CompletedToggleRule({ requestId: 99, repository, rule }),
    )
    expect(unchanged).toEqual(saving)
    expect(commands).toEqual([])
  })

  it("does not start another row mutation while one is unresolved", () => {
    const [saving] = update(loadedModel(), ToggledRule({ ruleId: rule.id }))
    const [unchanged, commands] = update(
      saving,
      ToggledRule({ ruleId: rule.id }),
    )
    expect(unchanged).toEqual(saving)
    expect(commands).toEqual([])
  })

  it("deletes a disabled rule using its server version", () => {
    const disabledRule = { ...rule, enabled: false }
    const [loading] = update(init(), SelectedRepositoryChanged({ repository }))
    const [disabledModel] = update(
      loading,
      LoadedRepositoryData({
        ...loaded,
        rules: [disabledRule],
      }),
    )
    const [confirming] = update(
      disabledModel,
      OpenedDeleteRule({ ruleId: rule.id }),
    )
    const [deleting, commands] = update(confirming, ConfirmedDeleteRule())
    expect(deleting.deletion._tag).toBe("DeleteDeleting")
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe("DeleteRule")
    expect(commands[0]?.args).toMatchObject({ ruleId: rule.id, version: 3 })
  })

  it("preserves delete intent and retries a conflict explicitly", () => {
    const disabledRule = { ...rule, enabled: false }
    const [loading] = update(init(), SelectedRepositoryChanged({ repository }))
    const [disabledModel] = update(
      loading,
      LoadedRepositoryData({ ...loaded, rules: [disabledRule] }),
    )
    const [confirming] = update(
      disabledModel,
      OpenedDeleteRule({ ruleId: rule.id }),
    )
    const [deleting] = update(confirming, ConfirmedDeleteRule())
    const [conflicted] = update(
      deleting,
      FailedToDeleteRule({
        requestId: 2,
        repository,
        message: "The rule changed.",
        conflict: {
          _tag: "RuleVersionConflict",
          expectedVersion: 3,
          currentRule: { ...disabledRule, version: 4 },
        },
      }),
    )
    expect(conflicted.deletion._tag).toBe("DeleteConflict")
    const [, commands] = update(conflicted, RetriedDeleteRule())
    expect(commands[0]?.args).toMatchObject({ version: 4 })
  })

  it("loads candidates before running a no-write test", () => {
    const [loadingCandidates, candidateCommands] = update(
      loadedModel(),
      OpenedRuleTest({ ruleId: rule.id }),
    )
    expect(candidateCommands.map((command) => command.name)).toEqual([
      "LoadRuleTestCandidates",
      "ShowDialog",
    ])
    const [configured] = update(
      loadingCandidates,
      LoadedRuleTestCandidates({
        repository,
        ruleId: rule.id,
        candidates: [
          {
            number: 42,
            title: "Improve docs",
            draft: false,
            author: "max",
            updatedAt: null,
          },
        ],
      }),
    )
    const [running, commands] = update(configured, RanRuleTest())
    expect(running.test._tag).toBe("TestRunning")
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe(TestRule.name)
    expect(commands[0]?.args).toMatchObject({ requestId: 2 })
  })

  it("stores server test results without changing rules", () => {
    const [loadingCandidates] = update(
      loadedModel(),
      OpenedRuleTest({ ruleId: rule.id }),
    )
    const [configured] = update(
      loadingCandidates,
      LoadedRuleTestCandidates({
        repository,
        ruleId: rule.id,
        candidates: [
          {
            number: 42,
            title: "Improve docs",
            draft: false,
            author: null,
            updatedAt: null,
          },
        ],
      }),
    )
    const [running] = update(configured, RanRuleTest())
    const [result] = update(
      running,
      CompletedRuleTest({
        requestId: 2,
        repository,
        result: {
          ruleId: rule.id,
          pullRequestNumber: 42,
          applies: true,
          selected: true,
          confidence: 0.92,
          confidenceThreshold: 0.8,
          rationale: "The pull request changes documentation.",
          proposedLabelChanges: { add: ["documentation"], remove: [] },
        },
      }),
    )
    expect(result.test._tag).toBe("TestResult")
    if (result.repository._tag === "LoadedRepository") {
      expect(result.repository.data.rules).toEqual([rule])
    }
  })

  it("ignores a completion from a dismissed test after another test starts", () => {
    const [firstLoading] = update(
      loadedModel(),
      OpenedRuleTest({ ruleId: rule.id }),
    )
    const candidates = [
      {
        number: 42,
        title: "Improve docs",
        draft: false,
        author: null,
        updatedAt: null,
      },
    ]
    const [firstConfigured] = update(
      firstLoading,
      LoadedRuleTestCandidates({ repository, ruleId: rule.id, candidates }),
    )
    const [firstRunning] = update(firstConfigured, RanRuleTest())
    const [dismissed] = update(firstRunning, DismissedRuleTest())
    const [secondLoading] = update(
      dismissed,
      OpenedRuleTest({ ruleId: rule.id }),
    )
    const [secondConfigured] = update(
      secondLoading,
      LoadedRuleTestCandidates({ repository, ruleId: rule.id, candidates }),
    )
    const [secondRunning] = update(secondConfigured, RanRuleTest())
    const [unchanged] = update(
      secondRunning,
      CompletedRuleTest({
        requestId: 2,
        repository,
        result: {
          ruleId: rule.id,
          pullRequestNumber: 42,
          applies: true,
          selected: true,
          confidence: 0.92,
          confidenceThreshold: 0.8,
          rationale: "stale",
          proposedLabelChanges: { add: ["documentation"], remove: [] },
        },
      }),
    )
    expect(unchanged).toEqual(secondRunning)
    expect(secondRunning.test).toMatchObject({
      _tag: "TestRunning",
      requestId: 3,
    })
  })

  it("ignores a failure from a dismissed test after another test starts", () => {
    const [firstLoading] = update(
      loadedModel(),
      OpenedRuleTest({ ruleId: rule.id }),
    )
    const candidates = [
      {
        number: 42,
        title: "Improve docs",
        draft: false,
        author: null,
        updatedAt: null,
      },
    ]
    const [firstConfigured] = update(
      firstLoading,
      LoadedRuleTestCandidates({ repository, ruleId: rule.id, candidates }),
    )
    const [firstRunning] = update(firstConfigured, RanRuleTest())
    const [dismissed] = update(firstRunning, DismissedRuleTest())
    const [secondLoading] = update(
      dismissed,
      OpenedRuleTest({ ruleId: rule.id }),
    )
    const [secondConfigured] = update(
      secondLoading,
      LoadedRuleTestCandidates({ repository, ruleId: rule.id, candidates }),
    )
    const [secondRunning] = update(secondConfigured, RanRuleTest())
    const [unchanged] = update(
      secondRunning,
      FailedRuleTest({
        requestId: 2,
        repository,
        message: "stale",
      }),
    )
    expect(unchanged).toEqual(secondRunning)
  })
})
