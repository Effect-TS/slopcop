import * as Dialog from "@foldkit/ui/dialog"
import * as Menu from "@foldkit/ui/menu"
import * as PolicyManagement from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import * as RuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as Schema from "effect/Schema"
import * as Scene from "foldkit/scene"
import { describe, expect, it } from "vite-plus/test"
import * as AiPromptEditor from "../../../src/components/ai-prompt-editor/index.ts"
import * as PolicyCodeEditor from "../../../src/components/policy-editor/index.ts"
import * as AutoLabeling from "../../../src/features/auto-labeling.ts"
import { Toast as RuleToast } from "../../../src/features/auto-labeling/toast.ts"

const repository = { owner: "effect", repo: "slopcop" }
const timestamp = "2026-08-08T00:00:00.000Z"
const policy = Schema.decodeUnknownSync(PolicyManagement.PublicPolicy)({
  id: "policy-1",
  name: "Documentation policy",
  target: "pull_request",
  currentVersionId: "version-1",
  version: 4,
  createdAt: timestamp,
  updatedAt: timestamp,
})
const secondPolicy = Schema.decodeUnknownSync(PolicyManagement.PublicPolicy)({
  id: "policy-second",
  name: "Second policy",
  target: "pull_request",
  currentVersionId: "version-2",
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
})
const program = Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
  target: "pull_request",
  appliesWhen: null,
  matchesWhen: {
    _tag: "FactPredicate",
    fact: "pull_request.title",
    operator: "Contains",
    value: "docs",
  },
})
const detail = Schema.decodeUnknownSync(PolicyManagement.PublicPolicyDetail)({
  policy: Schema.encodeSync(PolicyManagement.PublicPolicy)(policy),
  current: {
    id: "version-1",
    program,
    metadata: { description: "Matches docs." },
    version: 7,
    updatedAt: timestamp,
  },
})
const rule = Schema.decodeUnknownSync(RuleManagement.PublicLabelingRule)({
  _tag: "PolicyLabelingRule",
  id: "rule-1",
  policyId: policy.id,
  label: "documentation",
  onMatch: "ensure-present",
  onNoMatch: "preserve",
  conflictGroup: null,
  priority: 10,
  enabled: true,
  validationStatus: "valid",
  validatedAt: timestamp,
  version: 3,
  createdAt: timestamp,
  updatedAt: timestamp,
  policy: { id: policy.id, name: policy.name },
})
const aiRule = Schema.decodeUnknownSync(RuleManagement.PublicLabelingRule)({
  _tag: "AiLabelingRule",
  id: "rule-ai",
  label: "documentation",
  onMatch: "ensure-present",
  onNoMatch: "preserve",
  conflictGroup: null,
  priority: 5,
  enabled: true,
  validationStatus: "valid",
  validatedAt: timestamp,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  prompt: "Does this pull request change documentation?",
  evidence: ["pull_request.title", "pull_request.body"],
  minimumConfidence: 0.8,
  evaluator: "boolean-policy-v1",
  gatePolicyId: policy.id,
  gatePolicy: { id: policy.id, name: policy.name },
})
const loadedModel = (): AutoLabeling.Model => {
  const [loading] = AutoLabeling.update(
    AutoLabeling.init(),
    AutoLabeling.SelectedRepositoryChanged({ repository }),
  )
  return AutoLabeling.update(
    loading,
    AutoLabeling.LoadedRepositoryData({
      requestId: 1,
      repository,
      policyRevision: 5,
      ruleRevision: 8,
      policies: [policy, secondPolicy],
      rules: [rule, aiRule],
      activity: {
        windowDays: 30,
        totalFires: 1,
        rules: [{ ruleId: rule.id, fires: 1 }],
      },
      audit: [],
      labels: [{ name: "documentation", description: null, color: "0ea5e9" }],
    }),
  )[0]
}
const policiesView = Scene.withViewInputs(AutoLabeling.view, {
  surface: "Policies",
})
const autoLabelingView = Scene.withViewInputs(AutoLabeling.view, {
  surface: "AutoLabeling",
})

describe("generic policy UI", () => {
  it("renders the route-selected policy surface without local tabs", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(loadedModel()),
      Scene.expect(Scene.role("heading", { name: "Policies" })).toExist(),
      Scene.expect(Scene.text("pull_request")).toExist(),
      Scene.expect(Scene.text("Published")).not.toExist(),
      Scene.expect(Scene.role("tab")).not.toExist(),
    )
  })

  it("creates a pull request policy through the JSON program editor", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(loadedModel()),
      Scene.click(Scene.role("button", { name: "New policy" })),
      Scene.Command.resolve(Dialog.ShowDialog, Dialog.CompletedShowDialog()),
      Scene.Mount.resolve(
        PolicyCodeEditor.MountPolicyEditor,
        PolicyCodeEditor.MountedEditor(),
      ),
      Scene.expect(Scene.role("dialog")).toContainText("Policy program"),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Ctrl-Space for context-aware completions",
      ),
      Scene.expect(Scene.role("dialog")).toContainText("Include policy"),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Valid pull request policy JSON.",
      ),
      Scene.expect(Scene.role("combobox", { name: "Target" })).toBeDisabled(),
      Scene.expect(
        Scene.role("button", { name: "Create policy" }),
      ).toBeDisabled(),
    )
  })

  it("keeps invalid JSON editable and disables policy creation", () => {
    const opened = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedNewPolicy(),
    )[0]
    const invalid = AutoLabeling.update(
      opened,
      AutoLabeling.GotPolicyCodeEditorMessage({
        message: PolicyCodeEditor.EditedSource({ source: "{" }),
      }),
    )[0]
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(invalid),
      Scene.Mount.resolve(
        PolicyCodeEditor.MountPolicyEditor,
        PolicyCodeEditor.MountedEditor(),
      ),
      Scene.expect(Scene.role("alert")).toContainText("JSON"),
      Scene.expect(
        Scene.role("button", { name: "Create policy" }),
      ).toBeDisabled(),
    )
  })

  it("accepts a valid collection policy program", () => {
    const opened = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedNewPolicy(),
    )[0]
    const named = AutoLabeling.update(
      opened,
      AutoLabeling.UpdatedPolicyName({ name: "Source files" }),
    )[0]
    const source = JSON.stringify({
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        fact: "pull_request.changed_files",
        quantifier: "Any",
        item: {
          field: "content",
          operator: "ValidChangesetDocument",
        },
      },
    })
    const valid = AutoLabeling.update(
      named,
      AutoLabeling.GotPolicyCodeEditorMessage({
        message: PolicyCodeEditor.EditedSource({ source }),
      }),
    )[0]
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(valid),
      Scene.Mount.resolve(
        PolicyCodeEditor.MountPolicyEditor,
        PolicyCodeEditor.MountedEditor(),
      ),
      Scene.expect(
        Scene.role("button", { name: "Create policy" }),
      ).toBeEnabled(),
    )
  })

  it("rejects an AI policy without evidence", () => {
    const opened = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedNewPolicy(),
    )[0]
    const source = JSON.stringify({
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        aiPrompt: "Classify the pull request.",
        evidence: [],
        minimumConfidence: 0.8,
        evaluator: "boolean-policy-v1",
      },
    })
    const invalid = AutoLabeling.update(
      opened,
      AutoLabeling.GotPolicyCodeEditorMessage({
        message: PolicyCodeEditor.EditedSource({ source }),
      }),
    )[0]
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(invalid),
      Scene.Mount.resolve(
        PolicyCodeEditor.MountPolicyEditor,
        PolicyCodeEditor.MountedEditor(),
      ),
      Scene.expect(Scene.role("alert")).toExist(),
      Scene.expect(
        Scene.role("button", { name: "Create policy" }),
      ).toBeDisabled(),
    )
  })

  it("loads PublicPolicyDetail from the policy Edit menu before showing the program", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(loadedModel()),
      Scene.click(
        Scene.role("button", { name: "Actions for Documentation policy" }),
      ),
      Scene.Command.resolve(Menu.FocusItems, Menu.CompletedFocusItems()),
      Scene.Mount.resolveAll(
        [Menu.PortalMenuBackdrop, Menu.CompletedPortalMenuBackdrop()],
        [Menu.AnchorMenu, Menu.CompletedAnchorMenu()],
      ),
      Scene.click(Scene.role("menuitem", { name: "Edit policy" })),
      Scene.Mount.expectEnded(Menu.PortalMenuBackdrop),
      Scene.Mount.expectEnded(Menu.AnchorMenu),
      Scene.Command.resolveAll(
        [Menu.FocusButton, Menu.CompletedFocusButton()],
        [
          AutoLabeling.LoadPolicyDetail,
          AutoLabeling.LoadedPolicyDetail({ requestId: 2, repository, detail }),
        ],
        [Dialog.ShowDialog, Dialog.CompletedShowDialog()],
      ),
      Scene.Mount.resolve(
        PolicyCodeEditor.MountPolicyEditor,
        PolicyCodeEditor.MountedEditor(),
      ),
      Scene.expect(Scene.role("dialog")).toContainText("Edit policy"),
      Scene.expect(
        Scene.role("textbox", { name: "Description (optional)" }),
      ).toHaveValue("Matches docs."),
      Scene.expect(
        Scene.role("button", { name: "Validate saved policy" }),
      ).toExist(),
      Scene.expect(Scene.role("button", { name: "Save policy" })).toExist(),
    )
  })

  it("opens policy deletion from the actions menu", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(loadedModel()),
      Scene.click(
        Scene.role("button", { name: "Actions for Documentation policy" }),
      ),
      Scene.Command.resolve(Menu.FocusItems, Menu.CompletedFocusItems()),
      Scene.Mount.resolveAll(
        [Menu.PortalMenuBackdrop, Menu.CompletedPortalMenuBackdrop()],
        [Menu.AnchorMenu, Menu.CompletedAnchorMenu()],
      ),
      Scene.click(Scene.role("menuitem", { name: "Delete policy" })),
      Scene.Mount.expectEnded(Menu.PortalMenuBackdrop),
      Scene.Mount.expectEnded(Menu.AnchorMenu),
      Scene.Command.resolveAll(
        [Menu.FocusButton, Menu.CompletedFocusButton()],
        [Dialog.ShowDialog, Dialog.CompletedShowDialog()],
      ),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Policies used by labeling rules or other policies cannot be deleted.",
      ),
      Scene.expect(Scene.role("button", { name: "Delete policy" })).toExist(),
    )
  })

  it("disables validation while the displayed local draft is dirty", () => {
    const [loading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyEditor({ policyId: policy.id }),
    )
    const [editing] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedPolicyDetail({ requestId: 2, repository, detail }),
    )
    const [dirty] = AutoLabeling.update(
      editing,
      AutoLabeling.UpdatedPolicyName({ name: "Unsaved name" }),
    )
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(dirty),
      Scene.Mount.resolve(
        PolicyCodeEditor.MountPolicyEditor,
        PolicyCodeEditor.MountedEditor(),
      ),
      Scene.expect(
        Scene.role("button", { name: "Validate saved policy" }),
      ).toBeDisabled(),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Save local changes before validating.",
      ),
    )
  })

  it("shows included policies after validation", () => {
    const [loading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyEditor({ policyId: policy.id }),
    )
    const [editing] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedPolicyDetail({ requestId: 2, repository, detail }),
    )
    const [validating] = AutoLabeling.update(
      editing,
      AutoLabeling.ValidatedPolicy(),
    )
    if (validating.validation._tag !== "ValidationRunning")
      throw new Error("Expected policy validation to be running")
    const [validated] = AutoLabeling.update(
      validating,
      AutoLabeling.CompletedValidatePolicy({
        requestId: validating.validation.requestId,
        repository,
        policyId: policy.id,
        result: {
          facts: ["pull_request.title"],
          triggers: ["pull_request:edited"],
          references: [
            Schema.decodeUnknownSync(PolicyProgram.PolicyId)("policy-1"),
          ],
          nodeCount: 2,
        },
      }),
    )

    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(validated),
      Scene.Mount.resolve(
        PolicyCodeEditor.MountPolicyEditor,
        PolicyCodeEditor.MountedEditor(),
      ),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Included policies: Documentation policy (policy-1)",
      ),
    )
  })

  it("renders a referenced policy identifier in JSON source", () => {
    const referenceProgram = Schema.decodeUnknownSync(
      PolicyProgram.PolicyProgram,
    )({
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        _tag: "PolicyReference",
        policyId: "policy-historical",
      },
    })
    const referenceDetail = Schema.decodeUnknownSync(
      PolicyManagement.PublicPolicyDetail,
    )({
      policy: Schema.encodeSync(PolicyManagement.PublicPolicy)(policy),
      current: {
        id: "version-reference",
        program: referenceProgram,
        metadata: {},
        version: 7,
        updatedAt: timestamp,
      },
    })
    const [loading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyEditor({ policyId: policy.id }),
    )
    const [editing] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedPolicyDetail({
        requestId: 2,
        repository,
        detail: referenceDetail,
      }),
    )
    if (editing.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    expect(editing.policyEditor.sourceEditor.source).toContain(
      "policy-historical",
    )
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(editing),
      Scene.Mount.resolve(
        PolicyCodeEditor.MountPolicyEditor,
        PolicyCodeEditor.MountedEditor(),
      ),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Valid pull request policy JSON.",
      ),
    )
  })

  it("leaves the page interactive after successful policy save closes its dialog", () => {
    const [editing] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedNewPolicy(),
    )
    const [named] = AutoLabeling.update(
      editing,
      AutoLabeling.UpdatedPolicyName({ name: "Saved policy" }),
    )
    const [saving] = AutoLabeling.update(named, AutoLabeling.SavedPolicy())
    const [saved] = AutoLabeling.update(
      saving,
      AutoLabeling.CompletedSavePolicy({
        requestId: 2,
        repository,
        policy: secondPolicy,
      }),
    )
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(saved),
      Scene.expect(Scene.role("dialog")).not.toExist(),
      Scene.expect(Scene.role("button", { name: "New policy" })).toBeEnabled(),
    )
  })

  it("renders the current policy test outcome and keyed node trace", () => {
    const [loading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyTest({ policyId: policy.id }),
    )
    const [configured] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedPolicyTestCandidates({
        requestId: 2,
        repository,
        policyId: policy.id,
        candidates: [
          {
            number: 42,
            title: "Docs",
            draft: false,
            author: null,
            updatedAt: null,
          },
        ],
      }),
    )
    const [running] = AutoLabeling.update(
      configured,
      AutoLabeling.RanPolicyTest(),
    )
    const result = Schema.decodeUnknownSync(
      PolicyManagement.TestPolicyResponse,
    )({
      policyId: policy.id,
      policyVersionId: policy.currentVersionId,
      pullRequestNumber: 42,
      decision: {
        outcome: "Abstain",
        confidence: 0,
        rationale: "Applicability was false.",
        trace: [
          {
            location: {
              root: "matchesWhen",
              path: [{ _tag: "All", index: 0 }],
            },
            outcome: "NoMatch",
            rationale: "Title did not match.",
          },
        ],
      },
    })
    const [completed] = AutoLabeling.update(
      running,
      AutoLabeling.CompletedPolicyTest({ requestId: 3, repository, result }),
    )
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(completed),
      Scene.expect(Scene.role("dialog")).toContainText("Abstain"),
      Scene.expect(Scene.role("dialog")).toContainText("Node trace"),
      Scene.expect(Scene.role("dialog")).toContainText(
        "matchesWhen > All child 1: NoMatch",
      ),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Tested current policy version version-1",
      ),
    )
  })

  it("renders policy test transport failures as Error", () => {
    const [loading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyTest({ policyId: policy.id }),
    )
    const [failed] = AutoLabeling.update(
      loading,
      AutoLabeling.FailedToLoadPolicyTestCandidates({
        requestId: 2,
        repository,
        policyId: policy.id,
        message: "Candidates unavailable.",
      }),
    )
    Scene.scene(
      { update: AutoLabeling.update, view: policiesView() },
      Scene.given(failed),
      Scene.expect(Scene.role("alert")).toContainText(
        "Error: Candidates unavailable.",
      ),
    )
  })

  it("shows policy binding behavior and compact row menu", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: autoLabelingView() },
      Scene.given(loadedModel()),
      Scene.expect(Scene.text("Preserve")).toExist(),
      Scene.expect(Scene.text("Policy")).toExist(),
      Scene.expect(Scene.text("AI")).toExist(),
      Scene.expect(Scene.text("Policy: Documentation policy")).toExist(),
      Scene.expect(
        Scene.text("Does this pull request change documentation?"),
      ).toExist(),
      Scene.expect(Scene.text("Policy / gate")).not.toExist(),
      Scene.expect(Scene.text("area / 10")).not.toExist(),
      Scene.expect(
        Scene.role("switch", { name: "Disable Documentation policy" }),
      ).toExist(),
      Scene.expect(
        Scene.role("button", {
          name: "Actions for Documentation policy / documentation",
        }),
      ).toExist(),
    )
  })

  it("renders rule success messages as dismissible toasts", () => {
    const model = loadedModel()
    const [toast] = RuleToast.show(model.toast, {
      variant: "Success",
      payload: { message: "Saved label rule for documentation." },
    })
    Scene.scene(
      { update: AutoLabeling.update, view: autoLabelingView() },
      Scene.given({ ...model, toast }),
      Scene.expect(Scene.role("status")).toContainText(
        "Saved label rule for documentation.",
      ),
      Scene.expect(
        Scene.role("button", { name: "Dismiss notification" }),
      ).toExist(),
    )
  })

  it("opens the policy binding editor from the rule row menu", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: autoLabelingView() },
      Scene.given(loadedModel()),
      Scene.click(
        Scene.role("button", {
          name: "Actions for Documentation policy / documentation",
        }),
      ),
      Scene.Command.resolve(Menu.FocusItems, Menu.CompletedFocusItems()),
      Scene.Mount.resolveAll(
        [Menu.PortalMenuBackdrop, Menu.CompletedPortalMenuBackdrop()],
        [Menu.AnchorMenu, Menu.CompletedAnchorMenu()],
      ),
      Scene.click(Scene.role("menuitem", { name: "Edit label rule" })),
      Scene.Mount.expectEnded(Menu.PortalMenuBackdrop),
      Scene.Mount.expectEnded(Menu.AnchorMenu),
      Scene.Command.resolveAll(
        [Menu.FocusButton, Menu.CompletedFocusButton()],
        [Dialog.ShowDialog, Dialog.CompletedShowDialog()],
      ),
      Scene.expect(Scene.role("combobox", { name: "Policy" })).toExist(),
      Scene.expect(Scene.role("dialog")).toContainText("Rule type: Policy"),
      Scene.expect(Scene.role("combobox", { name: "Rule type" })).not.toExist(),
      Scene.expect(Scene.role("combobox", { name: "On no match" })).toExist(),
      Scene.expect(Scene.role("spinbutton", { name: "Priority" })).toExist(),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Rules with the same group are mutually exclusive. If several match, the lowest priority number wins and other labels in the group are removed.",
      ),
    )
  })

  it("offers a no-write test action from the rule row menu", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: autoLabelingView() },
      Scene.given(loadedModel()),
      Scene.click(
        Scene.role("button", {
          name: "Actions for Documentation policy / documentation",
        }),
      ),
      Scene.Command.resolve(Menu.FocusItems, Menu.CompletedFocusItems()),
      Scene.Mount.resolveAll(
        [Menu.PortalMenuBackdrop, Menu.CompletedPortalMenuBackdrop()],
        [Menu.AnchorMenu, Menu.CompletedAnchorMenu()],
      ),
      Scene.expect(
        Scene.role("menuitem", { name: "Test label rule" }),
      ).toExist(),
    )
  })

  it("creates an AI rule with accessible evidence and an optional gate", () => {
    Scene.scene(
      { update: AutoLabeling.update, view: autoLabelingView() },
      Scene.given(loadedModel()),
      Scene.click(Scene.role("button", { name: "New label rule" })),
      Scene.Command.resolve(Dialog.ShowDialog, Dialog.CompletedShowDialog()),
      Scene.type(
        Scene.role("combobox", { name: "Rule type" }),
        "AiLabelingRule",
      ),
      Scene.Mount.resolve(
        AiPromptEditor.MountAiPromptEditor,
        AiPromptEditor.MountedEditor(),
      ),
      Scene.expect(Scene.role("dialog")).toContainText("AI prompt"),
      Scene.expect(
        Scene.role("group", { name: "Information available to AI" }),
      ).toExist(),
      Scene.expect(Scene.role("dialog")).toContainText(
        "Selected pull request information is sent to the AI alongside your prompt. Select only what the AI needs to make this decision.",
      ),
      Scene.expect(
        Scene.role("checkbox", { name: "pull_request.title" }),
      ).toBeChecked(),
      Scene.expect(
        Scene.role("slider", { name: "Minimum confidence" }),
      ).toHaveAttr("aria-valuenow", "0.8"),
      Scene.expect(Scene.role("textbox", { name: "Evaluator" })).not.toExist(),
      Scene.expect(
        Scene.role("combobox", { name: "Gate policy (optional)" }),
      ).toExist(),
      Scene.expect(Scene.role("dialog")).toContainText(
        "AI runs only when this policy matches. If it does not match, the current label is preserved.",
      ),
    )
  })

  it("allows every saved policy in labeling rules", () => {
    const secondPolicyRule = {
      ...rule,
      enabled: false,
      policyId: secondPolicy.id,
      policy: { id: secondPolicy.id, name: secondPolicy.name },
    }
    const [loading] = AutoLabeling.update(
      AutoLabeling.init(),
      AutoLabeling.SelectedRepositoryChanged({ repository }),
    )
    const [model] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedRepositoryData({
        requestId: 1,
        repository,
        policyRevision: 1,
        ruleRevision: 1,
        policies: [secondPolicy],
        rules: [secondPolicyRule],
        activity: { windowDays: 30, totalFires: 0, rules: [] },
        audit: [],
        labels: [{ name: "documentation", description: null, color: "0ea5e9" }],
      }),
    )
    Scene.scene(
      { update: AutoLabeling.update, view: autoLabelingView() },
      Scene.given(model),
      Scene.expect(
        Scene.text("Unpublished policy; cannot enable"),
      ).not.toExist(),
      Scene.expect(
        Scene.role("switch", { name: "Enable Second policy" }),
      ).toBeEnabled(),
      Scene.expect(
        Scene.role("button", { name: "New label rule" }),
      ).toBeEnabled(),
      Scene.click(Scene.role("button", { name: "New label rule" })),
      Scene.Command.resolve(Dialog.ShowDialog, Dialog.CompletedShowDialog()),
      Scene.expect(Scene.role("option", { name: "Policy rule" })).toBeEnabled(),
      Scene.expect(Scene.role("combobox", { name: "Policy" })).toHaveValue(
        secondPolicy.id,
      ),
    )
  })
})
