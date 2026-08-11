import * as Dialog from "@foldkit/ui/dialog"
import * as Slider from "@foldkit/ui/slider"
import * as PolicyManagement from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import * as RuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vite-plus/test"
import * as AiPromptEditor from "../../../src/components/ai-prompt-editor/index.ts"
import * as AutoLabeling from "../../../src/features/auto-labeling.ts"
import {
  NodeKind,
  toProgram,
} from "../../../src/features/auto-labeling/condition.ts"

const repository = { owner: "effect", repo: "slopcop" }
const otherRepository = { owner: "effect", repo: "platform" }
const timestamp = "2026-08-08T00:00:00.000Z"
const draftPolicy = Schema.decodeUnknownSync(PolicyManagement.PublicPolicy)({
  id: "policy-draft",
  name: "Secondary policy",
  target: "pull_request",
  currentVersionId: "version-secondary",
  version: 2,
  createdAt: timestamp,
  updatedAt: timestamp,
})
const publishedPolicy = Schema.decodeUnknownSync(PolicyManagement.PublicPolicy)(
  {
    id: "policy-published",
    name: "Current policy",
    target: "pull_request",
    currentVersionId: "version-current",
    version: 4,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
)
const program = Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
  target: "pull_request",
  appliesWhen: {
    _tag: "FactPredicate",
    fact: "pull_request.draft",
    operator: "Equals",
    value: false,
  },
  matchesWhen: {
    _tag: "All",
    conditions: [
      {
        _tag: "FactPredicate",
        fact: "pull_request.title",
        operator: "Contains",
        value: "docs",
      },
    ],
  },
})
const detail = Schema.decodeUnknownSync(PolicyManagement.PublicPolicyDetail)({
  policy: Schema.encodeSync(PolicyManagement.PublicPolicy)(publishedPolicy),
  current: {
    id: "version-current",
    program,
    metadata: { description: "Classifies documentation changes." },
    version: 7,
    updatedAt: timestamp,
  },
})
const rule = Schema.decodeUnknownSync(RuleManagement.PublicLabelingRule)({
  _tag: "PolicyLabelingRule",
  id: "rule-1",
  policyId: publishedPolicy.id,
  label: "documentation",
  onMatch: "ensure-present",
  onNoMatch: "preserve",
  conflictGroup: "area",
  priority: 10,
  enabled: true,
  validationStatus: "valid",
  validatedAt: timestamp,
  version: 3,
  createdAt: timestamp,
  updatedAt: timestamp,
  policy: {
    id: publishedPolicy.id,
    name: publishedPolicy.name,
  },
})
const loaded = AutoLabeling.LoadedRepositoryData({
  requestId: 1,
  repository,
  policyRevision: 5,
  ruleRevision: 8,
  policies: [draftPolicy, publishedPolicy],
  rules: [rule],
  activity: {
    windowDays: 30,
    totalFires: 2,
    rules: [{ ruleId: rule.id, fires: 2 }],
  },
  audit: [],
  labels: [
    { name: "documentation", description: null, color: "0ea5e9" },
    { name: "code", description: null, color: "111111" },
  ],
})
const loadedModel = (): AutoLabeling.Model => {
  const [loading] = AutoLabeling.update(
    AutoLabeling.init(),
    AutoLabeling.SelectedRepositoryChanged({ repository }),
  )
  return AutoLabeling.update(loading, loaded)[0]
}
const newPolicyModel = (): AutoLabeling.Model =>
  AutoLabeling.update(loadedModel(), AutoLabeling.OpenedNewPolicy())[0]
const editingDetailModel = (): AutoLabeling.Model => {
  const [loading] = AutoLabeling.update(
    loadedModel(),
    AutoLabeling.OpenedPolicyEditor({ policyId: publishedPolicy.id }),
  )
  return AutoLabeling.update(
    loading,
    AutoLabeling.LoadedPolicyDetail({
      requestId: 2,
      repository,
      detail,
    }),
  )[0]
}
const candidate = {
  number: 42,
  title: "Improve docs",
  draft: false,
  author: null,
  updatedAt: null,
}
const testResult = Schema.decodeUnknownSync(
  PolicyManagement.TestPolicyResponse,
)({
  policyId: publishedPolicy.id,
  policyVersionId: publishedPolicy.currentVersionId,
  pullRequestNumber: 42,
  decision: {
    outcome: "Match",
    confidence: 0.91,
    rationale: "The title describes documentation work.",
    trace: [
      {
        location: {
          root: "matchesWhen",
          path: [{ _tag: "All", index: 0 }],
        },
        outcome: "Match",
        rationale: "Title contains docs.",
      },
    ],
  },
})

describe("generic policy programs", () => {
  it("loads policies, rules, activity, audit, and labels atomically", () => {
    const [loading, commands] = AutoLabeling.update(
      AutoLabeling.init(),
      AutoLabeling.SelectedRepositoryChanged({ repository }),
    )
    expect(commands[0]?.name).toBe("LoadRepositoryData")
    const [model] = AutoLabeling.update(loading, loaded)
    expect(model.repository).toMatchObject({
      _tag: "LoadedRepository",
      data: { policyRevision: 5, ruleRevision: 8, audit: [] },
    })
  })

  it("creates only a pull_request target with a generic draft program", () => {
    const model = newPolicyModel()
    expect(model.policyEditor).toMatchObject({
      _tag: "PolicyEditorEditing",
      identity: { _tag: "NewPolicy" },
      draft: {
        target: "pull_request",
        appliesWhen: null,
        matchesWhen: { _tag: "FactPredicate", fact: "pull_request.draft" },
      },
    })
  })

  it("edits typed scalar facts, operators, and operands", () => {
    const model = newPolicyModel()
    if (model.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const clientId = model.policyEditor.draft.matchesWhen.clientId
    const [fact] = AutoLabeling.update(
      model,
      AutoLabeling.UpdatedFact({ clientId, fact: "pull_request.title" }),
    )
    const [operator] = AutoLabeling.update(
      fact,
      AutoLabeling.UpdatedOperator({ clientId, operator: "MatchesGlob" }),
    )
    const [operand] = AutoLabeling.update(
      operator,
      AutoLabeling.UpdatedOperand({ clientId, value: "docs:*" }),
    )
    expect(operand.policyEditor).toMatchObject({
      draft: {
        matchesWhen: {
          _tag: "FactPredicate",
          fact: "pull_request.title",
          operator: "MatchesGlob",
          value: "docs:*",
        },
      },
    })
  })

  it("builds All, Any, and Not nodes with stable client identities", () => {
    const model = newPolicyModel()
    if (model.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const rootId = model.policyEditor.draft.matchesWhen.clientId
    const [all] = AutoLabeling.update(
      model,
      AutoLabeling.ChangedConditionKind({ clientId: rootId, kind: "All" }),
    )
    const [withChild] = AutoLabeling.update(
      all,
      AutoLabeling.AddedConditionChild({ clientId: rootId }),
    )
    if (withChild.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const condition = withChild.policyEditor.draft.matchesWhen
    expect(condition._tag).toBe("All")
    if (condition._tag !== "All") throw new Error("Expected All condition")
    expect(condition.clientId).toBe(rootId)
    expect(
      new Set(condition.conditions.map((child) => child.clientId)).size,
    ).toBe(2)
    const childId = condition.conditions[1]?.clientId
    if (childId === undefined) throw new Error("Expected second child")
    const [not] = AutoLabeling.update(
      withChild,
      AutoLabeling.ChangedConditionKind({ clientId: childId, kind: "Not" }),
    )
    expect(not.policyEditor).toMatchObject({
      draft: {
        matchesWhen: {
          conditions: [{}, { _tag: "Not", clientId: childId }],
        },
      },
    })
  })

  it("builds changed-file collection predicates including ValidChangesetDocument", () => {
    const model = newPolicyModel()
    if (model.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const rootId = model.policyEditor.draft.matchesWhen.clientId
    const [collection] = AutoLabeling.update(
      model,
      AutoLabeling.ChangedConditionKind({
        clientId: rootId,
        kind: "CollectionPredicate",
      }),
    )
    if (collection.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const condition = collection.policyEditor.draft.matchesWhen
    if (condition._tag !== "CollectionPredicate")
      throw new Error("Expected collection condition")
    const [field] = AutoLabeling.update(
      collection,
      AutoLabeling.UpdatedItemField({
        clientId: condition.item.clientId,
        field: "content",
      }),
    )
    const [validChangeset] = AutoLabeling.update(
      field,
      AutoLabeling.UpdatedItemOperator({
        clientId: condition.item.clientId,
        operator: "ValidChangesetDocument",
      }),
    )
    if (validChangeset.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const encoded = toProgram(validChangeset.policyEditor.draft)
    if (Result.isFailure(encoded)) {
      throw new Error(encoded.failure.issue.toString())
    }
    expect(encoded.success).toMatchObject({
      matchesWhen: {
        _tag: "CollectionPredicate",
        fact: "pull_request.changed_files",
        quantifier: "Any",
        item: { field: "content", operator: "ValidChangesetDocument" },
      },
    })
  })

  it("supports checks, reviews, quantifiers, and nested item boolean nodes", () => {
    const model = newPolicyModel()
    if (model.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const rootId = model.policyEditor.draft.matchesWhen.clientId
    const [collection] = AutoLabeling.update(
      model,
      AutoLabeling.ChangedConditionKind({
        clientId: rootId,
        kind: "CollectionPredicate",
      }),
    )
    if (collection.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const current = collection.policyEditor.draft.matchesWhen
    if (current._tag !== "CollectionPredicate")
      throw new Error("Expected collection condition")
    const [checks] = AutoLabeling.update(
      collection,
      AutoLabeling.UpdatedCollectionFact({
        clientId: rootId,
        fact: "pull_request.required_checks",
      }),
    )
    const [none] = AutoLabeling.update(
      checks,
      AutoLabeling.UpdatedQuantifier({ clientId: rootId, quantifier: "None" }),
    )
    const [nested] = AutoLabeling.update(
      none,
      AutoLabeling.ChangedItemKind({
        clientId: current.item.clientId,
        kind: "All",
      }),
    )
    expect(nested.policyEditor).toMatchObject({
      draft: {
        matchesWhen: {
          fact: "pull_request.required_checks",
          quantifier: "None",
          item: { _tag: "All", predicates: [{ field: "producer" }] },
        },
      },
    })
    const [reviews] = AutoLabeling.update(
      nested,
      AutoLabeling.UpdatedCollectionFact({
        clientId: rootId,
        fact: "pull_request.latest_reviews",
      }),
    )
    expect(reviews.policyEditor).toMatchObject({
      draft: { matchesWhen: { fact: "pull_request.latest_reviews" } },
    })
  })

  it("does not expose AI as a policy condition kind", () => {
    expect(NodeKind.literals).not.toContain("AiPrompt")
  })

  it("references another policy by stable policy ID", () => {
    const model = newPolicyModel()
    if (model.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const clientId = model.policyEditor.draft.matchesWhen.clientId
    const [reference] = AutoLabeling.update(
      model,
      AutoLabeling.ChangedConditionKind({
        clientId,
        kind: "PolicyReference",
      }),
    )
    const [included] = AutoLabeling.update(
      reference,
      AutoLabeling.UpdatedPolicyReference({
        clientId,
        policyId: publishedPolicy.id,
      }),
    )
    expect(included.policyEditor).toMatchObject({
      draft: {
        matchesWhen: {
          _tag: "PolicyReference",
          policyId: "policy-published",
        },
      },
    })
  })

  it("adds an optional applicability gate whose false outcome abstains", () => {
    const [withGate] = AutoLabeling.update(
      newPolicyModel(),
      AutoLabeling.ToggledAppliesWhen({ enabled: true }),
    )
    expect(withGate.policyEditor).toMatchObject({
      draft: { appliesWhen: { _tag: "FactPredicate" } },
    })
    const [withoutGate] = AutoLabeling.update(
      withGate,
      AutoLabeling.ToggledAppliesWhen({ enabled: false }),
    )
    expect(withoutGate.policyEditor).toMatchObject({
      draft: { appliesWhen: null },
    })
  })

  it("creates a valid generic policy draft", () => {
    const model = newPolicyModel()
    if (model.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const [named] = AutoLabeling.update(
      model,
      AutoLabeling.UpdatedPolicyName({ name: "Not drafts" }),
    )
    const [saving, commands] = AutoLabeling.update(
      named,
      AutoLabeling.SavedPolicy(),
    )
    expect(saving.policyEditor._tag).toBe("PolicyEditorSaving")
    expect(commands[0]?.args).toMatchObject({
      identity: { _tag: "NewPolicy" },
      draft: { target: "pull_request", matchesWhen: { _tag: "FactPredicate" } },
    })
  })
})

describe("policy detail, validation, saving, and testing", () => {
  it("loads PublicPolicyDetail before editing and rejects stale detail", () => {
    const [loading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyEditor({ policyId: publishedPolicy.id }),
    )
    expect(loading.policyEditor).toMatchObject({
      _tag: "PolicyEditorLoading",
      requestId: 2,
    })
    const [closed] = AutoLabeling.update(
      loading,
      AutoLabeling.ClosedPolicyEditor(),
    )
    const [reopened] = AutoLabeling.update(
      closed,
      AutoLabeling.OpenedPolicyEditor({ policyId: publishedPolicy.id }),
    )
    const [unchanged] = AutoLabeling.update(
      reopened,
      AutoLabeling.LoadedPolicyDetail({ requestId: 2, repository, detail }),
    )
    expect(unchanged).toEqual(reopened)
    expect(reopened.policyEditor).toMatchObject({
      _tag: "PolicyEditorLoading",
      requestId: 3,
    })
  })

  it("hydrates the current program and optimistic version from detail", () => {
    expect(editingDetailModel().policyEditor).toMatchObject({
      _tag: "PolicyEditorEditing",
      identity: {
        _tag: "ExistingPolicy",
        id: publishedPolicy.id,
        version: 7,
      },
      draft: {
        name: "Current policy",
        description: "Classifies documentation changes.",
        appliesWhen: { clientId: expect.any(String) },
        matchesWhen: { clientId: expect.any(String) },
      },
    })
  })

  it("preserves local changes and retries the current version", () => {
    const [named] = AutoLabeling.update(
      editingDetailModel(),
      AutoLabeling.UpdatedPolicyName({ name: "Local name" }),
    )
    const [saving] = AutoLabeling.update(named, AutoLabeling.SavedPolicy())
    const [conflicted] = AutoLabeling.update(
      saving,
      AutoLabeling.FailedToSavePolicy({
        requestId: 3,
        repository,
        message: "Conflict",
        currentPolicy: { ...publishedPolicy, version: 5 },
        currentVersion: 8,
      }),
    )
    expect(conflicted.policyEditor).toMatchObject({
      _tag: "PolicyEditorConflict",
      draft: { name: "Local name" },
      currentVersion: 8,
    })
    const [, commands] = AutoLabeling.update(
      conflicted,
      AutoLabeling.RetriedPolicySave(),
    )
    expect(commands[0]?.args).toMatchObject({
      identity: { _tag: "ExistingPolicy", version: 8 },
      draft: { name: "Local name" },
    })
  })

  it("validates an existing policy and ignores stale validation", () => {
    const [running, commands] = AutoLabeling.update(
      editingDetailModel(),
      AutoLabeling.ValidatedPolicy(),
    )
    expect(commands[0]?.name).toBe("ValidatePolicy")
    const result = {
      facts: ["pull_request.title"],
      triggers: [],
      references: [],
      nodeCount: 3,
    }
    const [stale] = AutoLabeling.update(
      running,
      AutoLabeling.CompletedValidatePolicy({
        requestId: 99,
        repository,
        policyId: publishedPolicy.id,
        result,
      }),
    )
    expect(stale).toEqual(running)
    const [validated] = AutoLabeling.update(
      running,
      AutoLabeling.CompletedValidatePolicy({
        requestId: 3,
        repository,
        policyId: publishedPolicy.id,
        result,
      }),
    )
    expect(validated.validation).toMatchObject({
      _tag: "ValidationResult",
      result,
    })
  })

  it("rejects stale candidate responses after close/reopen", () => {
    const [first] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyTest({ policyId: publishedPolicy.id }),
    )
    const [closed] = AutoLabeling.update(
      first,
      AutoLabeling.DismissedPolicyTest(),
    )
    const [second] = AutoLabeling.update(
      closed,
      AutoLabeling.OpenedPolicyTest({ policyId: publishedPolicy.id }),
    )
    const [unchanged] = AutoLabeling.update(
      second,
      AutoLabeling.LoadedPolicyTestCandidates({
        requestId: 2,
        repository,
        policyId: publishedPolicy.id,
        candidates: [candidate],
      }),
    )
    expect(unchanged).toEqual(second)
  })

  it("rejects stale candidate failures after close/reopen", () => {
    const [first] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyTest({ policyId: publishedPolicy.id }),
    )
    const [closed] = AutoLabeling.update(
      first,
      AutoLabeling.DismissedPolicyTest(),
    )
    const [second] = AutoLabeling.update(
      closed,
      AutoLabeling.OpenedPolicyTest({ policyId: publishedPolicy.id }),
    )
    const [unchanged] = AutoLabeling.update(
      second,
      AutoLabeling.FailedToLoadPolicyTestCandidates({
        requestId: 2,
        repository,
        policyId: publishedPolicy.id,
        message: "stale",
      }),
    )
    expect(unchanged).toEqual(second)
  })

  it("tests the current policy and stores Match plus node trace without writes", () => {
    const [loading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyTest({ policyId: publishedPolicy.id }),
    )
    const [configured] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedPolicyTestCandidates({
        requestId: 2,
        repository,
        policyId: publishedPolicy.id,
        candidates: [candidate],
      }),
    )
    const [running, commands] = AutoLabeling.update(
      configured,
      AutoLabeling.RanPolicyTest(),
    )
    expect(commands[0]?.name).toBe("TestPolicy")
    const [completed] = AutoLabeling.update(
      running,
      AutoLabeling.CompletedPolicyTest({
        requestId: 3,
        repository,
        result: testResult,
      }),
    )
    expect(completed.test).toMatchObject({
      _tag: "TestResult",
      result: {
        decision: {
          outcome: "Match",
          trace: [
            {
              location: {
                root: "matchesWhen",
                path: [{ _tag: "All", index: 0 }],
              },
            },
          ],
        },
      },
    })
  })

  it("tests a saved label rule without writing labels", () => {
    const [loading, loadCommands] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedRuleTest({ ruleId: rule.id }),
    )
    expect(loadCommands[0]?.name).toBe("LoadRuleTestCandidates")
    const [configured] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedRuleTestCandidates({
        requestId: 2,
        repository,
        ruleId: rule.id,
        candidates: [candidate],
      }),
    )
    const [running, testCommands] = AutoLabeling.update(
      configured,
      AutoLabeling.RanRuleTest(),
    )
    expect(testCommands[0]?.name).toBe("TestRule")
    const [completed] = AutoLabeling.update(
      running,
      AutoLabeling.CompletedRuleTest({
        requestId: 3,
        repository,
        result: {
          _tag: "PolicyLabelingRule",
          ruleId: rule.id,
          pullRequestNumber: candidate.number,
          outcome: "Match",
          confidence: 1,
          rationale: "The policy matched.",
          proposedAction: "add",
          proposedLabelChanges: { add: [rule.label], remove: [] },
          policyId: publishedPolicy.id,
        },
      }),
    )
    expect(completed.ruleTest).toMatchObject({
      _tag: "RuleTestResult",
      result: { outcome: "Match", proposedAction: "add" },
    })
  })
})

describe("label rule variants and request safety", () => {
  it("opens a policy rule when any policy is available", () => {
    const [loading] = AutoLabeling.update(
      AutoLabeling.init(),
      AutoLabeling.SelectedRepositoryChanged({ repository }),
    )
    const [draftOnly] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedRepositoryData({
        ...loaded,
        policies: [draftPolicy],
        rules: [],
      }),
    )
    const [editing, commands] = AutoLabeling.update(
      draftOnly,
      AutoLabeling.OpenedNewRule(),
    )
    expect(editing.ruleEditor).toMatchObject({
      _tag: "RuleEditorEditing",
      draft: {
        _tag: "PolicyLabelingRule",
        policyId: draftPolicy.id,
      },
    })
    expect(commands.some((command) => command.name === "ShowDialog")).toBe(true)
  })

  it("creates a rule bound to a PolicyId with generic behavior", () => {
    const [editing] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedNewRule(),
    )
    const [noMatch] = AutoLabeling.update(
      editing,
      AutoLabeling.UpdatedRuleNoMatch({ onNoMatch: "ensure-absent" }),
    )
    const [grouped] = AutoLabeling.update(
      noMatch,
      AutoLabeling.UpdatedRuleConflictGroup({ conflictGroup: "area" }),
    )
    const [prioritized] = AutoLabeling.update(
      grouped,
      AutoLabeling.UpdatedRulePriority({ priority: 20 }),
    )
    const [, commands] = AutoLabeling.update(
      prioritized,
      AutoLabeling.SavedRule(),
    )
    expect(commands[0]?.args).toMatchObject({
      identity: { _tag: "NewRule" },
      draft: {
        _tag: "PolicyLabelingRule",
        policyId: draftPolicy.id,
        onNoMatch: "ensure-absent",
        conflictGroup: "area",
        priority: 20,
      },
    })
  })

  it("creates an AI rule with evidence, confidence, and an optional gate", () => {
    const [policyDraft] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedNewRule(),
    )
    const [aiDraft] = AutoLabeling.update(
      policyDraft,
      AutoLabeling.ChangedRuleType({ ruleType: "AiLabelingRule" }),
    )
    const [prompted] = AutoLabeling.update(
      aiDraft,
      AutoLabeling.GotAiPromptEditorMessage({
        message: AiPromptEditor.EditedSource({
          source:
            "Does {{fact:pull_request.body}} indicate a documentation change?",
        }),
      }),
    )
    const [, blockedCommands] = AutoLabeling.update(
      prompted,
      AutoLabeling.SavedRule(),
    )
    expect(blockedCommands).toEqual([])
    const [withEvidence] = AutoLabeling.update(
      prompted,
      AutoLabeling.ToggledRuleEvidence({ fact: "pull_request.body" }),
    )
    const [confident] = AutoLabeling.update(
      withEvidence,
      AutoLabeling.GotConfidenceSliderMessage({
        message: Slider.PressedPointer({ value: 0.9, originValue: 0.8 }),
      }),
    )
    const [gated] = AutoLabeling.update(
      confident,
      AutoLabeling.UpdatedRuleGatePolicy({
        gatePolicyId: publishedPolicy.id,
      }),
    )
    const [, commands] = AutoLabeling.update(gated, AutoLabeling.SavedRule())
    expect(commands[0]?.args).toMatchObject({
      identity: { _tag: "NewRule" },
      draft: {
        _tag: "AiLabelingRule",
        promptEditor: {
          source:
            "Does {{fact:pull_request.body}} indicate a documentation change?",
        },
        evidence: ["pull_request.title", "pull_request.body"],
        minimumConfidence: 0.9,
        evaluator: "boolean-policy-v1",
        gatePolicyId: publishedPolicy.id,
      },
    })
  })

  it("allows enabling a rule for any policy", () => {
    const unpublishedRule = {
      ...rule,
      enabled: false,
      policyId: draftPolicy.id,
      policy: { id: draftPolicy.id, name: draftPolicy.name },
    }
    const [loading] = AutoLabeling.update(
      AutoLabeling.init(),
      AutoLabeling.SelectedRepositoryChanged({ repository }),
    )
    const [model] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedRepositoryData({
        ...loaded,
        rules: [unpublishedRule],
      }),
    )
    const [saving, commands] = AutoLabeling.update(
      model,
      AutoLabeling.ToggledRule({ ruleId: rule.id }),
    )
    expect(saving.rowMutation).toMatchObject({
      _tag: "RowMutationSaving",
      enabled: true,
    })
    expect(commands[0]?.name).toBe("ToggleRule")
  })

  it("preserves rule conflict drafts and retries current versions", () => {
    const [editing] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [changed] = AutoLabeling.update(
      editing,
      AutoLabeling.UpdatedRuleLabel({ label: "code" }),
    )
    const [saving] = AutoLabeling.update(changed, AutoLabeling.SavedRule())
    const [conflicted] = AutoLabeling.update(
      saving,
      AutoLabeling.FailedToSaveRule({
        requestId: 2,
        repository,
        message: "Conflict",
        currentRule: { ...rule, version: 4 },
        revisionConflict: false,
      }),
    )
    expect(conflicted.ruleEditor).toMatchObject({
      _tag: "RuleEditorConflict",
      draft: { label: "code" },
    })
    const [, commands] = AutoLabeling.update(
      conflicted,
      AutoLabeling.RetriedRuleSave(),
    )
    expect(commands[0]?.args).toMatchObject({
      identity: { _tag: "ExistingRule", version: 4 },
      draft: { label: "code" },
    })
  })

  it("keeps toggle intent through conflicts and retries", () => {
    const [saving] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.ToggledRule({ ruleId: rule.id }),
    )
    const [failed] = AutoLabeling.update(
      saving,
      AutoLabeling.FailedToToggleRule({
        requestId: 2,
        repository,
        ruleId: rule.id,
        message: "Conflict",
        currentRule: { ...rule, version: 4 },
        revisionConflict: false,
      }),
    )
    const [, commands] = AutoLabeling.update(
      failed,
      AutoLabeling.RetriedToggleRule(),
    )
    expect(commands[0]?.args).toMatchObject({ version: 4, enabled: false })
  })

  it("requires rules to be disabled before deletion", () => {
    const [confirming] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedDeleteRule({ ruleId: rule.id }),
    )
    const [blocked, commands] = AutoLabeling.update(
      confirming,
      AutoLabeling.ConfirmedDeleteRule(),
    )
    expect(blocked).toEqual(confirming)
    expect(commands).toEqual([])
  })

  it("ignores stale repository and mutation completions", () => {
    const [first] = AutoLabeling.update(
      AutoLabeling.init(),
      AutoLabeling.SelectedRepositoryChanged({ repository }),
    )
    const [second] = AutoLabeling.update(
      first,
      AutoLabeling.RetriedRepositoryLoad(),
    )
    expect(AutoLabeling.update(second, loaded)[0]).toEqual(second)

    const [editing] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [saving] = AutoLabeling.update(editing, AutoLabeling.SavedRule())
    expect(
      AutoLabeling.update(
        saving,
        AutoLabeling.CompletedSaveRule({ requestId: 99, repository, rule }),
      )[0],
    ).toEqual(saving)
  })

  it("surfaces refresh failures while preserving stale loaded data", () => {
    const before = loadedModel()
    const [refreshing] = AutoLabeling.update(
      before,
      AutoLabeling.RetriedRepositoryLoad(),
    )
    const [failed] = AutoLabeling.update(
      refreshing,
      AutoLabeling.FailedToLoadRepositoryData({
        requestId: 2,
        repository,
        message: "Refresh failed.",
      }),
    )
    expect(failed.repository).toEqual(before.repository)
    expect(failed.refreshError).toBe("Refresh failed.")
  })

  it("repository changes reset all feature and Dialog models", () => {
    const editing = newPolicyModel()
    expect(editing.policyEditorDialog.isOpen).toBe(true)
    const [changed] = AutoLabeling.update(
      editing,
      AutoLabeling.SelectedRepositoryChanged({ repository: otherRepository }),
    )
    expect(changed.policyEditor._tag).toBe("PolicyEditorClosed")
    expect(changed.policyEditorDialog.isOpen).toBe(false)
    expect(changed.policyDeleteDialog.isOpen).toBe(false)
    expect(changed.ruleEditorDialog.isOpen).toBe(false)
    expect(changed.ruleDeleteDialog.isOpen).toBe(false)
    expect(changed.testDialog.isOpen).toBe(false)
  })
})

describe("final policy UI lifecycle and boundary safety", () => {
  it("closes the policy Dialog.Model after a successful save", () => {
    const model = newPolicyModel()
    const [named] = AutoLabeling.update(
      model,
      AutoLabeling.UpdatedPolicyName({ name: "New policy" }),
    )
    const [saving] = AutoLabeling.update(named, AutoLabeling.SavedPolicy())
    const [saved, commands] = AutoLabeling.update(
      saving,
      AutoLabeling.CompletedSavePolicy({
        requestId: 2,
        repository,
        policy: draftPolicy,
      }),
    )
    expect(saved.policyEditor._tag).toBe("PolicyEditorClosed")
    expect(saved.policyEditorDialog.isOpen).toBe(false)
    expect(saved.statusMessage).toBeNull()
    expect(saved.toast.entries[0]?.payload.message).toBe(
      "Created policy Secondary policy.",
    )
    expect(commands.map((command) => command.name)).toContain(
      "LoadRepositoryData",
    )
  })

  it("shows update and delete policy toasts", () => {
    const [loading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyEditor({ policyId: publishedPolicy.id }),
    )
    const [editing] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedPolicyDetail({ requestId: 2, repository, detail }),
    )
    const [saving] = AutoLabeling.update(editing, AutoLabeling.SavedPolicy())
    const [saved] = AutoLabeling.update(
      saving,
      AutoLabeling.CompletedSavePolicy({
        requestId: 3,
        repository,
        policy: publishedPolicy,
      }),
    )
    expect(saved.toast.entries[0]?.payload.message).toBe(
      "Updated policy Current policy.",
    )

    const [confirming] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedDeletePolicy({ policyId: publishedPolicy.id }),
    )
    const [deleting, commands] = AutoLabeling.update(
      confirming,
      AutoLabeling.ConfirmedDeletePolicy(),
    )
    expect(commands[0]?.name).toBe("DeletePolicy")
    const [deleted] = AutoLabeling.update(
      deleting,
      AutoLabeling.CompletedDeletePolicy({
        requestId: 2,
        repository,
        policyId: publishedPolicy.id,
      }),
    )
    expect(deleted.policyDeleteDialog.isOpen).toBe(false)
    expect(deleted.toast.entries[0]?.payload.message).toBe(
      "Deleted policy Current policy.",
    )
  })

  it("closes rule save and rule delete Dialog.Models on success", () => {
    const [editingRule] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [savingRule] = AutoLabeling.update(
      editingRule,
      AutoLabeling.SavedRule(),
    )
    const [savedRule] = AutoLabeling.update(
      savingRule,
      AutoLabeling.CompletedSaveRule({ requestId: 2, repository, rule }),
    )
    expect(savedRule.ruleEditorDialog.isOpen).toBe(false)
    expect(savedRule.statusMessage).toBeNull()
    expect(savedRule.toast.entries).toHaveLength(1)
    expect(savedRule.toast.entries[0]?.payload.message).toBe(
      "Saved label rule for documentation.",
    )

    const disabledRule = { ...rule, enabled: false }
    const [loading] = AutoLabeling.update(
      AutoLabeling.init(),
      AutoLabeling.SelectedRepositoryChanged({ repository }),
    )
    const [disabled] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedRepositoryData({ ...loaded, rules: [disabledRule] }),
    )
    const [confirmingDelete] = AutoLabeling.update(
      disabled,
      AutoLabeling.OpenedDeleteRule({ ruleId: rule.id }),
    )
    const [deleting] = AutoLabeling.update(
      confirmingDelete,
      AutoLabeling.ConfirmedDeleteRule(),
    )
    const [deleted] = AutoLabeling.update(
      deleting,
      AutoLabeling.CompletedDeleteRule({
        requestId: 2,
        repository,
        ruleId: rule.id,
      }),
    )
    expect(deleted.ruleDeleteDialog.isOpen).toBe(false)
  })

  it("rejects explicit and Dialog-requested closure while policy save runs", () => {
    const [named] = AutoLabeling.update(
      newPolicyModel(),
      AutoLabeling.UpdatedPolicyName({ name: "Saving policy" }),
    )
    const [saving] = AutoLabeling.update(named, AutoLabeling.SavedPolicy())
    expect(
      AutoLabeling.update(saving, AutoLabeling.ClosedPolicyEditor())[0],
    ).toEqual(saving)
    expect(
      AutoLabeling.update(
        saving,
        AutoLabeling.GotPolicyEditorDialogMessage({
          message: Dialog.RequestedClose(),
        }),
      )[0],
    ).toEqual(saving)
  })

  it("rejects closure while rule save, delete, and test commands run", () => {
    const [ruleEditing] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedRuleEditor({ ruleId: rule.id }),
    )
    const [ruleSaving] = AutoLabeling.update(
      ruleEditing,
      AutoLabeling.SavedRule(),
    )
    expect(
      AutoLabeling.update(ruleSaving, AutoLabeling.ClosedRuleEditor())[0],
    ).toEqual(ruleSaving)

    const disabledRule = { ...rule, enabled: false }
    const [loading] = AutoLabeling.update(
      AutoLabeling.init(),
      AutoLabeling.SelectedRepositoryChanged({ repository }),
    )
    const [disabled] = AutoLabeling.update(
      loading,
      AutoLabeling.LoadedRepositoryData({ ...loaded, rules: [disabledRule] }),
    )
    const [deleteConfirming] = AutoLabeling.update(
      disabled,
      AutoLabeling.OpenedDeleteRule({ ruleId: rule.id }),
    )
    const [deleting] = AutoLabeling.update(
      deleteConfirming,
      AutoLabeling.ConfirmedDeleteRule(),
    )
    expect(
      AutoLabeling.update(deleting, AutoLabeling.DismissedDeleteRule())[0],
    ).toEqual(deleting)

    const [testLoading] = AutoLabeling.update(
      loadedModel(),
      AutoLabeling.OpenedPolicyTest({ policyId: publishedPolicy.id }),
    )
    const [configured] = AutoLabeling.update(
      testLoading,
      AutoLabeling.LoadedPolicyTestCandidates({
        requestId: 2,
        repository,
        policyId: publishedPolicy.id,
        candidates: [candidate],
      }),
    )
    const [running] = AutoLabeling.update(
      configured,
      AutoLabeling.RanPolicyTest(),
    )
    expect(
      AutoLabeling.update(running, AutoLabeling.DismissedPolicyTest())[0],
    ).toEqual(running)
    expect(
      AutoLabeling.update(
        running,
        AutoLabeling.GotTestDialogMessage({ message: Dialog.RequestedClose() }),
      )[0],
    ).toEqual(running)
  })

  it("disables validation for local changes and validates saved policies only", () => {
    const clean = editingDetailModel()
    const [validating, commands] = AutoLabeling.update(
      clean,
      AutoLabeling.ValidatedPolicy(),
    )
    expect(validating.validation._tag).toBe("ValidationRunning")
    expect(commands[0]?.name).toBe("ValidatePolicy")

    const [dirty] = AutoLabeling.update(
      clean,
      AutoLabeling.UpdatedPolicyName({ name: "Unsaved local name" }),
    )
    expect(dirty.policyEditor).toMatchObject({ dirty: true })
    const [unchanged, dirtyCommands] = AutoLabeling.update(
      dirty,
      AutoLabeling.ValidatedPolicy(),
    )
    expect(unchanged).toEqual(dirty)
    expect(dirtyCommands).toEqual([])
  })

  it("returns conversion failures instead of throwing for invalid reachable drafts", () => {
    const model = newPolicyModel()
    if (model.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const clientId = model.policyEditor.draft.matchesWhen.clientId
    const [fact] = AutoLabeling.update(
      model,
      AutoLabeling.UpdatedFact({ clientId, fact: "pull_request.title" }),
    )
    const [inOperator] = AutoLabeling.update(
      fact,
      AutoLabeling.UpdatedOperator({ clientId, operator: "In" }),
    )
    const [invalidIn] = AutoLabeling.update(
      inOperator,
      AutoLabeling.UpdatedOperand({ clientId, value: "docs,,code" }),
    )
    if (invalidIn.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    expect(AutoLabeling.validPolicyDraft(invalidIn.policyEditor.draft)).toBe(
      false,
    )
    expect(
      AutoLabeling.update(invalidIn, AutoLabeling.SavedPolicy())[1],
    ).toEqual([])
  })

  it("strips visual editor client identities from policy programs", () => {
    const model = newPolicyModel()
    if (model.policyEditor._tag !== "PolicyEditorEditing")
      throw new Error("Expected policy editor")
    const converted = toProgram(model.policyEditor.draft)
    if (Result.isFailure(converted))
      throw new Error(converted.failure.issue.toString())
    expect(JSON.stringify(converted.success)).not.toContain("clientId")
    expect(JSON.stringify(converted.success)).not.toContain('"id"')
  })
})
