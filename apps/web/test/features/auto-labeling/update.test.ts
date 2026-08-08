import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vite-plus/test"
import {
  CompletedRuleTest,
  ConfirmedDeleteRule,
  FailedToSaveRule,
  LoadedRepositoryData,
  LoadedRuleTestCandidates,
  OpenedNewRule,
  OpenedDeleteRule,
  OpenedRuleEditor,
  OpenedRuleTest,
  RanRuleTest,
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
    const [failed] = update(
      saving,
      FailedToSaveRule({
        repository,
        message: "The server rule changed.",
        currentRule: rule,
      }),
    )
    expect(failed.editor._tag).toBe("EditorFailed")
    if (failed.editor._tag === "EditorFailed") {
      expect(failed.editor.draft.name).toBe("My unsaved name")
      expect(failed.editor.currentRule?.version).toBe(3)
    }
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

  it("loads candidates before running a no-write test", () => {
    const [loadingCandidates, candidateCommands] = update(
      loadedModel(),
      OpenedRuleTest({ ruleId: rule.id }),
    )
    expect(candidateCommands).toHaveLength(1)
    expect(candidateCommands[0]?.name).toBe("LoadRuleTestCandidates")
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
        repository,
        result: {
          ruleId: rule.id,
          pullRequestNumber: 42,
          applies: true,
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
})
