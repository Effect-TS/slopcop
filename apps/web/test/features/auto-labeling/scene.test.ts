import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Schema from "effect/Schema"
import * as Scene from "foldkit/scene"
import { describe, it } from "vite-plus/test"

import * as AutoLabeling from "../../../src/features/auto-labeling.ts"

const repository = { owner: "effect", repo: "slopcop" }
const rule = Schema.decodeUnknownSync(
  LabelingRuleManagement.PublicLabelingRule,
)({
  id: "rule-1",
  name: "Server rule",
  label: "documentation",
  kind: "ai",
  instructions: "Apply to documentation changes.",
  confidenceThreshold: 0.8,
  mode: "add-only",
  exclusiveGroup: null,
  enabled: true,
  validationStatus: "valid",
  validatedAt: "2026-08-08T00:00:00.000Z",
  version: 4,
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
})

const conflictModel = (): AutoLabeling.Model => {
  const [loading] = AutoLabeling.update(
    AutoLabeling.init(),
    AutoLabeling.SelectedRepositoryChanged({ repository }),
  )
  const [loaded] = AutoLabeling.update(
    loading,
    AutoLabeling.LoadedRepositoryData({
      requestId: 1,
      repository,
      revision: 8,
      rules: [{ ...rule, version: 3 }],
      activity: { windowDays: 30, totalFires: 0, rules: [] },
      labels: [{ name: "documentation", description: null, color: "0ea5e9" }],
    }),
  )
  const [editing] = AutoLabeling.update(
    loaded,
    AutoLabeling.OpenedRuleEditor({ ruleId: rule.id }),
  )
  const [drafted] = AutoLabeling.update(
    editing,
    AutoLabeling.UpdatedRuleName({ name: "My local draft" }),
  )
  const [saving] = AutoLabeling.update(drafted, AutoLabeling.SavedRule())
  return AutoLabeling.update(
    saving,
    AutoLabeling.FailedToSaveRule({
      requestId: 2,
      repository,
      message: "The rule changed on the server.",
      conflict: {
        _tag: "RuleVersionConflict",
        expectedVersion: 3,
        currentRule: rule,
      },
    }),
  )[0]
}

const belowThresholdResultModel = (): AutoLabeling.Model => {
  const [loading] = AutoLabeling.update(
    AutoLabeling.init(),
    AutoLabeling.SelectedRepositoryChanged({ repository }),
  )
  const [loaded] = AutoLabeling.update(
    loading,
    AutoLabeling.LoadedRepositoryData({
      requestId: 1,
      repository,
      revision: 8,
      rules: [rule],
      activity: { windowDays: 30, totalFires: 0, rules: [] },
      labels: [{ name: "documentation", description: null, color: "0ea5e9" }],
    }),
  )
  const [loadingCandidates] = AutoLabeling.update(
    loaded,
    AutoLabeling.OpenedRuleTest({ ruleId: rule.id }),
  )
  const [configured] = AutoLabeling.update(
    loadingCandidates,
    AutoLabeling.LoadedRuleTestCandidates({
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
  const [running] = AutoLabeling.update(configured, AutoLabeling.RanRuleTest())
  return AutoLabeling.update(
    running,
    AutoLabeling.CompletedRuleTest({
      requestId: 2,
      repository,
      result: {
        ruleId: rule.id,
        pullRequestNumber: 42,
        applies: true,
        selected: false,
        confidence: 0.7,
        confidenceThreshold: 0.8,
        rationale: "The classifier matched below the configured threshold.",
        proposedLabelChanges: { add: [], remove: [] },
      },
    }),
  )[0]
}

describe("Auto-labeling conflicts", () => {
  it("shows local draft recovery and expected versus current versions", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: AutoLabeling.view },
      Scene.given(conflictModel()),
      Scene.expect(Scene.role("dialog")).toContainText("My local draft"),
      Scene.expect(Scene.role("alert")).toContainText(
        "Expected rule version 3; current server version is 4.",
      ),
      Scene.expect(
        Scene.role("button", { name: "Reload current server values" }),
      ).toExist(),
      Scene.expect(
        Scene.role("button", { name: "Keep draft and retry latest" }),
      ).toExist(),
      Scene.expect(Scene.role("button", { name: "Cancel" })).toExist(),
    )
  })

  it("retries only after the user chooses to keep the draft", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: AutoLabeling.view },
      Scene.given(conflictModel()),
      Scene.click(
        Scene.role("button", { name: "Keep draft and retry latest" }),
      ),
      Scene.expect(Scene.role("button", { name: "Saving..." })).toExist(),
      Scene.Command.resolve(
        AutoLabeling.SaveRule,
        AutoLabeling.FailedToSaveRule({
          requestId: 3,
          repository,
          message: "The retry failed.",
          conflict: null,
        }),
      ),
    )
  })
})

describe("Auto-labeling rule test results", () => {
  it("displays the effective thresholded outcome", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: AutoLabeling.view },
      Scene.given(belowThresholdResultModel()),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Would not apply / 70% confidence",
      ),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Proposed additionsNone",
      ),
    )
  })
})
