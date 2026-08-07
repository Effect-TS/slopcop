import * as Story from "foldkit/story"
import { describe, expect, it } from "vite-plus/test"

import {
  ClosedRuleEditor,
  DismissedRuleTest,
  OpenedDeleteRule,
  OpenedRuleEditor,
  OpenedRuleTest,
  RanRuleTest,
  ToggledRule,
  ToggledRuleMenu,
  UpdatedRuleConfidence,
  UpdatedRuleExclusiveGroup,
  UpdatedRuleKind,
  UpdatedRuleLabel,
  UpdatedRulePrompt,
  init,
  update,
} from "../../../src/features/auto-labeling.ts"

describe("Auto-labeling table update", () => {
  it("updates prompts from the table editor", () => {
    Story.story(
      update,
      Story.given(init()),
      Story.message(
        UpdatedRulePrompt({
          ruleId: "Bug",
          prompt: "Apply when a regression is fixed.",
        }),
      ),
      Story.model((model) => {
        expect(model.bugPrompt).toBe("Apply when a regression is fixed.")
      }),
      Story.Command.expectNone(),
    )
  })

  it("toggles rules and opens and closes the table editor", () => {
    Story.story(
      update,
      Story.given(init()),
      Story.message(ToggledRule({ ruleId: "Dependencies" })),
      Story.message(OpenedRuleEditor({ ruleId: "Dependencies" })),
      Story.model((model) => {
        expect(model.dependenciesEnabled).toBe(true)
        expect(model.editingRule).toBe("Dependencies")
      }),
      Story.message(ClosedRuleEditor()),
      Story.model((model) => {
        expect(model.editingRule).toBeNull()
      }),
      Story.Command.expectNone(),
    )
  })

  it("updates the table modal label and confidence settings", () => {
    Story.story(
      update,
      Story.given(init()),
      Story.message(
        UpdatedRuleLabel({ ruleId: "Bug", label: "breaking-change" }),
      ),
      Story.message(UpdatedRuleConfidence({ ruleId: "Bug", confidence: 90 })),
      Story.model((model) => {
        expect(model.bugLabel).toBe("breaking-change")
        expect(model.bugConfidence).toBe(90)
      }),
      Story.Command.expectNone(),
    )
  })

  it("updates advanced behavior and constrains ready-for-review rules", () => {
    Story.story(
      update,
      Story.given(init()),
      Story.message(
        UpdatedRuleExclusiveGroup({
          ruleId: "Documentation",
          exclusiveGroup: "release-state",
        }),
      ),
      Story.message(
        UpdatedRuleKind({
          ruleId: "Documentation",
          kind: "ready-for-review",
        }),
      ),
      Story.model((model) => {
        expect(model.documentationExclusiveGroup).toBe("release-state")
        expect(model.documentationKind).toBe("ready-for-review")
        expect(model.documentationMode).toBe("reconcile")
      }),
      Story.Command.expectNone(),
    )
  })

  it("moves through the no-write rule test workflow", () => {
    Story.story(
      update,
      Story.given(init()),
      Story.message(ToggledRuleMenu({ ruleId: "Bug" })),
      Story.message(OpenedRuleTest({ ruleId: "Bug" })),
      Story.model((model) => {
        expect(model.openRuleMenu).toBeNull()
        expect(model.testingRule).toBe("Bug")
        expect(model.ruleTestStage).toBe("Configure")
      }),
      Story.message(RanRuleTest()),
      Story.model((model) => {
        expect(model.ruleTestStage).toBe("Result")
      }),
      Story.message(DismissedRuleTest()),
      Story.model((model) => {
        expect(model.testingRule).toBeNull()
        expect(model.ruleTestStage).toBe("Closed")
      }),
      Story.Command.expectNone(),
    )
  })

  it("opens delete confirmation from a row action menu", () => {
    Story.story(
      update,
      Story.given(init()),
      Story.message(ToggledRuleMenu({ ruleId: "Dependencies" })),
      Story.message(OpenedDeleteRule({ ruleId: "Dependencies" })),
      Story.model((model) => {
        expect(model.openRuleMenu).toBeNull()
        expect(model.deletingRule).toBe("Dependencies")
      }),
      Story.Command.expectNone(),
    )
  })
})
