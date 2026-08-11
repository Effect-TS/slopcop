import * as Dialog from "@foldkit/ui/dialog"
import * as Menu from "@foldkit/ui/menu"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as FoldkitCommand from "foldkit/command"
import { evo } from "foldkit/struct"
import * as PolicyCodeEditor from "../../components/policy-editor"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
import * as C from "./command"
import type { Command } from "./command"
import {
  defaultCondition,
  defaultItemForCollection,
  draftConditionFrom,
  mapCondition,
  mapItem,
  removeItem,
  removeCondition,
  toProgram,
  type DraftCondition,
  type DraftItem,
  type PolicyDraft,
} from "./condition"
import type { Message } from "./message"
import {
  PolicyActionMenu,
  PolicyEditorState,
  PublishState,
  RepositoryState,
  RowMutationState,
  RuleActionMenu,
  RuleDeleteState,
  RuleEditorState,
  TestState,
  ValidationState,
  currentRepository,
  ruleDraftFrom,
  type Model,
  type PolicyId,
  type Repository,
  type RuleDraft,
  type RuleId,
} from "./model"

export type UpdateReturn = readonly [Model, ReadonlyArray<Command>]
const sameRepository = (left: Repository | null, right: Repository): boolean =>
  left !== null && left.owner === right.owner && left.repo === right.repo
const data = (model: Model) =>
  model.repository._tag === "LoadedRepository" ? model.repository.data : null
const policy = (model: Model, id: PolicyId) =>
  data(model)?.policies.find((item) => item.id === id) ?? null
const rule = (model: Model, id: RuleId) =>
  data(model)?.rules.find((item) => item.id === id) ?? null
const publishedPolicies = (model: Model) =>
  data(model)?.policies.filter((item) => item.publishedVersionId !== null) ?? []
const policyReferences = (
  model: Model,
  excludedPolicyId?: PolicyId,
): ReadonlyArray<PolicyCodeEditor.PolicyReference> =>
  publishedPolicies(model).flatMap((item) =>
    item.publishedVersionId === null || item.id === excludedPolicyId
      ? []
      : [{ policyVersionId: item.publishedVersionId, name: item.name }],
  )

const requestRepository = (
  model: Model,
  repository: Repository,
  showLoading: boolean,
): UpdateReturn => {
  const requestId = model.nextRequestId
  return [
    evo(model, {
      repository: (state) =>
        showLoading
          ? RepositoryState.cases.LoadingRepository.make({ repository })
          : state,
      repositoryRequest: () => ({ requestId, repository }),
      refreshError: () => null,
      nextRequestId: (id) => id + 1,
    }),
    [C.LoadRepositoryData({ requestId, repository })],
  ]
}
const refresh = (model: Model, repository: Repository): UpdateReturn =>
  requestRepository(model, repository, false)
const resetFeature = (model: Model): Model =>
  evo(model, {
    policyEditor: () => PolicyEditorState.cases.PolicyEditorClosed.make({}),
    validation: () => ValidationState.cases.ValidationIdle.make({}),
    publishing: () => PublishState.cases.PublishClosed.make({}),
    ruleEditor: () => RuleEditorState.cases.RuleEditorClosed.make({}),
    ruleDeletion: () => RuleDeleteState.cases.RuleDeleteClosed.make({}),
    test: () => TestState.cases.TestClosed.make({}),
    rowMutation: () => RowMutationState.cases.RowMutationIdle.make({}),
    refreshError: () => null,
    statusMessage: () => null,
    policyEditorDialog: () => Dialog.init({ id: "policy-editor" }),
    publishDialog: () => Dialog.init({ id: "publish-policy" }),
    ruleEditorDialog: () => Dialog.init({ id: "rule-editor" }),
    ruleDeleteDialog: () => Dialog.init({ id: "delete-rule" }),
    testDialog: () => Dialog.init({ id: "policy-test" }),
    policyMenus: () => ({}),
    ruleMenus: () => ({}),
  })

const updatePolicyDraft = (
  model: Model,
  transform: (draft: PolicyDraft) => PolicyDraft,
): Model => {
  const editor = model.policyEditor
  if (
    editor._tag === "PolicyEditorClosed" ||
    editor._tag === "PolicyEditorLoading" ||
    editor._tag === "PolicyEditorSaving"
  )
    return model
  if (editor._tag === "PolicyEditorConflict")
    return evo(model, {
      policyEditor: () =>
        PolicyEditorState.cases.PolicyEditorConflict.make({
          ...editor,
          draft: transform(editor.draft),
          sourceEditor: editor.sourceEditor,
          dirty: true,
        }),
      validation: () => ValidationState.cases.ValidationIdle.make({}),
    })
  return evo(model, {
    policyEditor: () =>
      PolicyEditorState.cases.PolicyEditorEditing.make({
        draft: transform(editor.draft),
        sourceEditor: editor.sourceEditor,
        identity: editor.identity,
        dirty: true,
      }),
    validation: () => ValidationState.cases.ValidationIdle.make({}),
  })
}
const updatePolicyCodeEditor = (
  model: Model,
  message: PolicyCodeEditor.Message,
): Model => {
  const editor = model.policyEditor
  if (
    editor._tag === "PolicyEditorClosed" ||
    editor._tag === "PolicyEditorLoading" ||
    editor._tag === "PolicyEditorSaving"
  )
    return model
  const [sourceEditor] = PolicyCodeEditor.update(editor.sourceEditor, message)
  const dirty = editor.dirty || message._tag === "EditedSource"
  if (editor._tag === "PolicyEditorConflict")
    return evo(model, {
      policyEditor: () =>
        PolicyEditorState.cases.PolicyEditorConflict.make({
          ...editor,
          sourceEditor,
          dirty,
        }),
      validation: () => ValidationState.cases.ValidationIdle.make({}),
    })
  return evo(model, {
    policyEditor: () =>
      PolicyEditorState.cases.PolicyEditorEditing.make({
        draft: editor.draft,
        sourceEditor,
        identity: editor.identity,
        dirty,
      }),
    validation: () => ValidationState.cases.ValidationIdle.make({}),
  })
}
const updateRuleDraft = (
  model: Model,
  transform: (draft: RuleDraft) => RuleDraft,
): Model => {
  const editor = model.ruleEditor
  if (editor._tag === "RuleEditorClosed" || editor._tag === "RuleEditorSaving")
    return model
  if (editor._tag === "RuleEditorConflict")
    return evo(model, {
      ruleEditor: () =>
        RuleEditorState.cases.RuleEditorConflict.make({
          ...editor,
          draft: transform(editor.draft),
        }),
    })
  return evo(model, {
    ruleEditor: () =>
      RuleEditorState.cases.RuleEditorEditing.make({
        draft: transform(editor.draft),
        identity: editor.identity,
      }),
  })
}
const mapProgramConditions = (
  draft: PolicyDraft,
  clientId: string,
  transform: (condition: DraftCondition) => DraftCondition,
): PolicyDraft => ({
  ...draft,
  appliesWhen:
    draft.appliesWhen === null
      ? null
      : mapCondition(draft.appliesWhen, clientId, transform),
  matchesWhen: mapCondition(draft.matchesWhen, clientId, transform),
})
const mapItemsInCondition = (
  condition: DraftCondition,
  clientId: string,
  transform: (
    item: DraftItem,
    fact: Extract<DraftCondition, { _tag: "CollectionPredicate" }>["fact"],
  ) => DraftItem,
): DraftCondition => {
  switch (condition._tag) {
    case "All":
    case "Any":
      return {
        ...condition,
        conditions: condition.conditions.map((child) =>
          mapItemsInCondition(child, clientId, transform),
        ),
      }
    case "Not":
      return {
        ...condition,
        condition: mapItemsInCondition(
          condition.condition,
          clientId,
          transform,
        ),
      }
    case "CollectionPredicate":
      return {
        ...condition,
        item: mapItem(condition.item, clientId, (item) =>
          transform(item, condition.fact),
        ),
      }
    default:
      return condition
  }
}
const mapProgramItems = (
  draft: PolicyDraft,
  clientId: string,
  transform: (
    item: DraftItem,
    fact: Extract<DraftCondition, { _tag: "CollectionPredicate" }>["fact"],
  ) => DraftItem,
): PolicyDraft => ({
  ...draft,
  appliesWhen:
    draft.appliesWhen === null
      ? null
      : mapItemsInCondition(draft.appliesWhen, clientId, transform),
  matchesWhen: mapItemsInCondition(draft.matchesWhen, clientId, transform),
})
const removeItemsInCondition = (
  condition: DraftCondition,
  clientId: string,
): DraftCondition => {
  switch (condition._tag) {
    case "All":
    case "Any":
      return {
        ...condition,
        conditions: condition.conditions.map((child) =>
          removeItemsInCondition(child, clientId),
        ),
      }
    case "Not":
      return {
        ...condition,
        condition: removeItemsInCondition(condition.condition, clientId),
      }
    case "CollectionPredicate":
      return { ...condition, item: removeItem(condition.item, clientId) }
    default:
      return condition
  }
}
const removeProgramCondition = (
  draft: PolicyDraft,
  clientId: string,
): PolicyDraft => ({
  ...draft,
  appliesWhen:
    draft.appliesWhen === null
      ? null
      : removeCondition(draft.appliesWhen, clientId),
  matchesWhen: removeCondition(draft.matchesWhen, clientId),
})
const conditionCount = (condition: DraftCondition): number => {
  switch (condition._tag) {
    case "All":
    case "Any":
      return (
        1 +
        condition.conditions.reduce(
          (sum, child) => sum + conditionCount(child),
          0,
        )
      )
    case "Not":
      return 1 + conditionCount(condition.condition)
    default:
      return 1
  }
}
const programNodeCount = (draft: PolicyDraft): number =>
  conditionCount(draft.matchesWhen) +
  (draft.appliesWhen === null ? 0 : conditionCount(draft.appliesWhen))
const validInOperand = (value: string): boolean => {
  const values = value.split(",")
  return values.length > 0 && values.every((item) => item.trim().length > 0)
}
const itemValid = (
  item: DraftItem,
  fact: Extract<DraftCondition, { _tag: "CollectionPredicate" }>["fact"],
  depth: number,
): boolean => {
  if (depth > 8) return false
  switch (item._tag) {
    case "All":
    case "Any":
      return (
        item.predicates.length > 0 &&
        item.predicates.every((child) => itemValid(child, fact, depth + 1))
      )
    case "Not":
      return itemValid(item.predicate, fact, depth + 1)
    case "Predicate": {
      const fields =
        fact === "pull_request.changed_files"
          ? ["path", "status", "content"]
          : fact === "pull_request.required_checks"
            ? ["producer", "name", "state"]
            : ["reviewer", "state"]
      return (
        fields.includes(item.field) &&
        (item.operator !== "ValidChangesetDocument" ||
          (fact === "pull_request.changed_files" &&
            item.field === "content")) &&
        (item.operator === "IsEmpty" ||
          item.operator === "NotEmpty" ||
          item.operator === "ValidChangesetDocument" ||
          (item.operator === "In"
            ? validInOperand(item.value)
            : item.value.trim().length > 0))
      )
    }
  }
}
const conditionDepth = (condition: DraftCondition): number => {
  switch (condition._tag) {
    case "All":
    case "Any":
      return 1 + Math.max(0, ...condition.conditions.map(conditionDepth))
    case "Not":
      return 1 + conditionDepth(condition.condition)
    default:
      return 1
  }
}
const conditionValid = (condition: DraftCondition): boolean => {
  switch (condition._tag) {
    case "All":
    case "Any":
      return (
        condition.conditions.length > 0 &&
        condition.conditions.every(conditionValid)
      )
    case "Not":
      return conditionValid(condition.condition)
    case "FactPredicate":
      return (
        condition.operator === "IsEmpty" ||
        condition.operator === "NotEmpty" ||
        (condition.operator === "In"
          ? validInOperand(condition.value)
          : condition.value.trim().length > 0)
      )
    case "CollectionPredicate":
      return itemValid(condition.item, condition.fact, 1)
    case "AiPrompt":
      return (
        condition.prompt.trim().length > 0 &&
        condition.prompt.length <= 4_000 &&
        condition.evidence.length > 0 &&
        condition.evidence.length <= 8 &&
        condition.minimumConfidence >= 0 &&
        condition.minimumConfidence <= 1
      )
    case "PolicyReference":
      return condition.policyVersionId.length > 0
  }
}
export const validPolicyDraft = (draft: PolicyDraft): boolean =>
  draft.name.trim().length > 0 &&
  draft.name.length <= 100 &&
  draft.description.length <= 1_000 &&
  programNodeCount(draft) <= 64 &&
  conditionDepth(draft.matchesWhen) <= 8 &&
  (draft.appliesWhen === null || conditionDepth(draft.appliesWhen) <= 8) &&
  conditionValid(draft.matchesWhen) &&
  (draft.appliesWhen === null || conditionValid(draft.appliesWhen)) &&
  Result.isSuccess(toProgram(draft))

const draftFromDetail = (
  detail: typeof import("@slopcop/domain/Labeling/LabelingPolicyManagement").PublicPolicyDetail.Type,
  startSequence: number,
): readonly [PolicyDraft, number] => {
  let sequence = startSequence
  const nextItemId = () => `item-${sequence++}`
  return [
    {
      name: detail.policy.name,
      description: detail.draft.metadata.description ?? "",
      target: "pull_request",
      appliesWhen:
        detail.draft.program.appliesWhen === null
          ? null
          : draftConditionFrom(detail.draft.program.appliesWhen, nextItemId),
      matchesWhen: draftConditionFrom(
        detail.draft.program.matchesWhen,
        nextItemId,
      ),
    },
    sequence,
  ]
}

export const update = (model: Model, message: Message): UpdateReturn => {
  switch (message._tag) {
    case "SelectedRepositoryChanged":
      return message.repository === null
        ? [
            evo(resetFeature(model), {
              repository: () => RepositoryState.cases.NoRepository.make({}),
              repositoryRequest: () => null,
            }),
            [],
          ]
        : requestRepository(resetFeature(model), message.repository, true)
    case "RetriedRepositoryLoad": {
      const repository = currentRepository(model)
      return repository === null
        ? [model, []]
        : requestRepository(
            model,
            repository,
            model.repository._tag !== "LoadedRepository",
          )
    }
    case "LoadedRepositoryData": {
      const request = model.repositoryRequest
      if (
        request === null ||
        request.requestId !== message.requestId ||
        !sameRepository(request.repository, message.repository)
      )
        return [model, []]
      return [
        evo(model, {
          repository: () =>
            RepositoryState.cases.LoadedRepository.make({
              data: {
                repository: message.repository,
                policyRevision: message.policyRevision,
                ruleRevision: message.ruleRevision,
                policies: message.policies,
                rules: message.rules,
                activity: message.activity,
                audit: message.audit,
                labels: message.labels,
              },
            }),
          repositoryRequest: () => null,
          refreshError: () => null,
          policyMenus: () =>
            Object.fromEntries(
              message.policies.map((item) => [
                item.id,
                model.policyMenus[item.id] ??
                  Menu.init({ id: `policy-actions-${item.id}` }),
              ]),
            ),
          ruleMenus: () =>
            Object.fromEntries(
              message.rules.map((item) => [
                item.id,
                model.ruleMenus[item.id] ??
                  Menu.init({ id: `rule-actions-${item.id}` }),
              ]),
            ),
        }),
        [],
      ]
    }
    case "FailedToLoadRepositoryData": {
      const request = model.repositoryRequest
      if (
        request === null ||
        request.requestId !== message.requestId ||
        !sameRepository(request.repository, message.repository)
      )
        return [model, []]
      return [
        evo(model, {
          repository: (state) =>
            state._tag === "LoadedRepository"
              ? state
              : RepositoryState.cases.FailedRepository.make({
                  repository: message.repository,
                  message: message.message,
                }),
          repositoryRequest: () => null,
          refreshError: () =>
            model.repository._tag === "LoadedRepository"
              ? message.message
              : null,
        }),
        [],
      ]
    }
    case "SelectedTab":
      return [evo(model, { tab: () => message.tab }), []]
    case "IgnoredInput":
      return [model, []]

    case "OpenedNewPolicy": {
      if (data(model) === null) return [model, []]
      const matchesClientId = `condition-${model.nextNodeSequence}`
      const matchesWhen = defaultCondition(
        "FactPredicate",
        matchesClientId,
        `condition-${model.nextNodeSequence + 1}`,
        `item-${model.nextNodeSequence + 1}`,
      )
      return openDialog(
        evo(model, {
          policyEditor: () =>
            PolicyEditorState.cases.PolicyEditorEditing.make({
              draft: {
                name: "",
                description: "",
                target: "pull_request",
                appliesWhen: null,
                matchesWhen,
              },
              sourceEditor: PolicyCodeEditor.init({
                id: "policy-program-editor",
                program: {
                  target: "pull_request",
                  appliesWhen: null,
                  matchesWhen: {
                    _tag: "FactPredicate",
                    fact: "pull_request.draft",
                    operator: "Equals",
                    value: false,
                  },
                },
                references: policyReferences(model),
              }),
              identity: { _tag: "NewPolicy" },
              dirty: true,
            }),
          validation: () => ValidationState.cases.ValidationIdle.make({}),
          nextNodeSequence: (value) => value + 2,
        }),
        "policyEditorDialog",
      )
    }
    case "OpenedPolicyEditor": {
      const repository = currentRepository(model)
      const item = policy(model, message.policyId)
      if (repository === null || item === null) return [model, []]
      const requestId = model.nextRequestId
      return openDialog(
        evo(model, {
          policyEditor: () =>
            PolicyEditorState.cases.PolicyEditorLoading.make({
              policy: item,
              requestId,
            }),
          validation: () => ValidationState.cases.ValidationIdle.make({}),
          nextRequestId: (value) => value + 1,
        }),
        "policyEditorDialog",
        [C.LoadPolicyDetail({ requestId, repository, policyId: item.id })],
      )
    }
    case "LoadedPolicyDetail": {
      const editor = model.policyEditor
      if (
        !sameRepository(currentRepository(model), message.repository) ||
        editor._tag !== "PolicyEditorLoading" ||
        editor.requestId !== message.requestId ||
        editor.policy.id !== message.detail.policy.id
      )
        return [model, []]
      const [draft, nextSequence] = draftFromDetail(
        message.detail,
        model.nextNodeSequence,
      )
      return [
        evo(model, {
          policyEditor: () =>
            PolicyEditorState.cases.PolicyEditorEditing.make({
              draft,
              sourceEditor: PolicyCodeEditor.init({
                id: "policy-program-editor",
                program: message.detail.draft.program,
                references: policyReferences(model, message.detail.policy.id),
              }),
              identity: {
                _tag: "ExistingPolicy",
                id: message.detail.policy.id,
                draftVersion: message.detail.draft.version,
              },
              dirty: false,
            }),
          nextNodeSequence: () => nextSequence,
        }),
        [],
      ]
    }
    case "FailedToLoadPolicyDetail": {
      const editor = model.policyEditor
      return sameRepository(currentRepository(model), message.repository) &&
        editor._tag === "PolicyEditorLoading" &&
        editor.requestId === message.requestId &&
        editor.policy.id === message.policyId
        ? closeDialog(
            evo(model, {
              policyEditor: () =>
                PolicyEditorState.cases.PolicyEditorClosed.make({}),
              refreshError: () => message.message,
            }),
            "policyEditorDialog",
          )
        : [model, []]
    }
    case "ClosedPolicyEditor":
      return model.policyEditor._tag === "PolicyEditorSaving"
        ? [model, []]
        : closeDialog(
            evo(model, {
              policyEditor: () =>
                PolicyEditorState.cases.PolicyEditorClosed.make({}),
              validation: () => ValidationState.cases.ValidationIdle.make({}),
            }),
            "policyEditorDialog",
          )
    case "UpdatedPolicyName":
      return [
        updatePolicyDraft(model, (draft) => ({ ...draft, name: message.name })),
        [],
      ]
    case "UpdatedPolicyDescription":
      return [
        updatePolicyDraft(model, (draft) => ({
          ...draft,
          description: message.description,
        })),
        [],
      ]
    case "GotPolicyCodeEditorMessage":
      return [updatePolicyCodeEditor(model, message.message), []]
    case "ToggledAppliesWhen": {
      if (!message.enabled)
        return [
          updatePolicyDraft(model, (draft) => ({
            ...draft,
            appliesWhen: null,
          })),
          [],
        ]
      const clientId = `condition-${model.nextNodeSequence}`
      return [
        evo(
          updatePolicyDraft(model, (draft) => ({
            ...draft,
            appliesWhen:
              draft.appliesWhen ??
              defaultCondition(
                "FactPredicate",
                clientId,
                `condition-${model.nextNodeSequence + 1}`,
                `item-${model.nextNodeSequence + 1}`,
              ),
          })),
          { nextNodeSequence: (value) => value + 2 },
        ),
        [],
      ]
    }
    case "ChangedConditionKind": {
      const replacement = defaultCondition(
        message.kind,
        message.clientId,
        `condition-${model.nextNodeSequence}`,
        `item-${model.nextNodeSequence + 1}`,
      )
      return [
        evo(
          updatePolicyDraft(model, (draft) =>
            mapProgramConditions(draft, message.clientId, () => replacement),
          ),
          { nextNodeSequence: (value) => value + 2 },
        ),
        [],
      ]
    }
    case "AddedConditionChild": {
      const editor = model.policyEditor
      if (
        editor._tag === "PolicyEditorClosed" ||
        editor._tag === "PolicyEditorLoading" ||
        editor._tag === "PolicyEditorSaving" ||
        programNodeCount(editor.draft) >= 64
      )
        return [model, []]
      const clientId = `condition-${model.nextNodeSequence}`
      const child = defaultCondition(
        "FactPredicate",
        clientId,
        `condition-${model.nextNodeSequence + 1}`,
        `item-${model.nextNodeSequence + 1}`,
      )
      return [
        evo(
          updatePolicyDraft(model, (draft) =>
            mapProgramConditions(draft, message.clientId, (condition) =>
              condition._tag === "All" || condition._tag === "Any"
                ? { ...condition, conditions: [...condition.conditions, child] }
                : condition,
            ),
          ),
          { nextNodeSequence: (value) => value + 2 },
        ),
        [],
      ]
    }
    case "RemovedConditionNode":
      return [
        updatePolicyDraft(model, (draft) =>
          removeProgramCondition(draft, message.clientId),
        ),
        [],
      ]
    case "UpdatedFact":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) =>
            condition._tag === "FactPredicate"
              ? {
                  ...condition,
                  fact: message.fact,
                  operator:
                    message.fact === "pull_request.draft"
                      ? "Equals"
                      : "Contains",
                  value: message.fact === "pull_request.draft" ? "false" : "",
                }
              : condition,
          ),
        ),
        [],
      ]
    case "UpdatedOperator":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) =>
            condition._tag === "FactPredicate"
              ? { ...condition, operator: message.operator }
              : condition,
          ),
        ),
        [],
      ]
    case "UpdatedOperand":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) =>
            condition._tag === "FactPredicate"
              ? { ...condition, value: message.value }
              : condition,
          ),
        ),
        [],
      ]
    case "UpdatedCollectionFact":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) =>
            condition._tag === "CollectionPredicate"
              ? {
                  ...condition,
                  fact: message.fact,
                  item: defaultItemForCollection(
                    condition.item.clientId,
                    message.fact,
                  ),
                }
              : condition,
          ),
        ),
        [],
      ]
    case "UpdatedQuantifier":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) =>
            condition._tag === "CollectionPredicate"
              ? { ...condition, quantifier: message.quantifier }
              : condition,
          ),
        ),
        [],
      ]
    case "ChangedItemKind": {
      const childId = `item-${model.nextNodeSequence}`
      return [
        evo(
          updatePolicyDraft(model, (draft) =>
            mapProgramItems(draft, message.clientId, (item, fact) => {
              switch (message.kind) {
                case "All":
                case "Any":
                  return {
                    _tag: message.kind,
                    clientId: item.clientId,
                    predicates: [defaultItemForCollection(childId, fact)],
                  }
                case "Not":
                  return {
                    _tag: "Not",
                    clientId: item.clientId,
                    predicate: defaultItemForCollection(childId, fact),
                  }
                case "Predicate":
                  return defaultItemForCollection(item.clientId, fact)
              }
            }),
          ),
          { nextNodeSequence: (value) => value + 1 },
        ),
        [],
      ]
    }
    case "AddedItemChild": {
      const childId = `item-${model.nextNodeSequence}`
      return [
        evo(
          updatePolicyDraft(model, (draft) =>
            mapProgramItems(draft, message.clientId, (item, fact) =>
              item._tag === "All" || item._tag === "Any"
                ? {
                    ...item,
                    predicates: [
                      ...item.predicates,
                      defaultItemForCollection(childId, fact),
                    ],
                  }
                : item,
            ),
          ),
          { nextNodeSequence: (value) => value + 1 },
        ),
        [],
      ]
    }
    case "RemovedItemNode":
      return [
        updatePolicyDraft(model, (draft) => ({
          ...draft,
          appliesWhen:
            draft.appliesWhen === null
              ? null
              : removeItemsInCondition(draft.appliesWhen, message.clientId),
          matchesWhen: removeItemsInCondition(
            draft.matchesWhen,
            message.clientId,
          ),
        })),
        [],
      ]
    case "UpdatedItemField":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramItems(draft, message.clientId, (item) =>
            item._tag === "Predicate"
              ? {
                  ...item,
                  field: message.field,
                  operator: message.field === "status" ? "Equals" : "Contains",
                  value: "",
                }
              : item,
          ),
        ),
        [],
      ]
    case "UpdatedItemOperator":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramItems(draft, message.clientId, (item) =>
            item._tag === "Predicate"
              ? { ...item, operator: message.operator }
              : item,
          ),
        ),
        [],
      ]
    case "UpdatedItemOperand":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramItems(draft, message.clientId, (item) =>
            item._tag === "Predicate"
              ? { ...item, value: message.value }
              : item,
          ),
        ),
        [],
      ]
    case "UpdatedAiPrompt":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) =>
            condition._tag === "AiPrompt"
              ? { ...condition, prompt: message.prompt }
              : condition,
          ),
        ),
        [],
      ]
    case "ToggledAiEvidence":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) => {
            if (condition._tag !== "AiPrompt") return condition
            const selected = condition.evidence.includes(message.fact)
            const evidence = selected
              ? condition.evidence.filter((fact) => fact !== message.fact)
              : condition.evidence.length >= 8
                ? condition.evidence
                : [...condition.evidence, message.fact]
            return evidence.length === 0
              ? condition
              : { ...condition, evidence }
          }),
        ),
        [],
      ]
    case "UpdatedAiConfidence":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) =>
            condition._tag === "AiPrompt"
              ? { ...condition, minimumConfidence: message.minimumConfidence }
              : condition,
          ),
        ),
        [],
      ]
    case "UpdatedPolicyReference":
      return [
        updatePolicyDraft(model, (draft) =>
          mapProgramConditions(draft, message.clientId, (condition) =>
            condition._tag === "PolicyReference"
              ? { ...condition, policyVersionId: message.policyVersionId }
              : condition,
          ),
        ),
        [],
      ]
    case "SavedPolicy":
      return savePolicy(model, false)
    case "RetriedPolicySave":
      return savePolicy(model, true)
    case "ReloadedPolicyEditor": {
      const editor = model.policyEditor
      if (editor._tag !== "PolicyEditorConflict") return [model, []]
      const repository = currentRepository(model)
      if (repository === null) return [model, []]
      const requestId = model.nextRequestId
      return [
        evo(model, {
          policyEditor: () =>
            PolicyEditorState.cases.PolicyEditorLoading.make({
              policy: editor.currentPolicy,
              requestId,
            }),
          nextRequestId: (value) => value + 1,
        }),
        [
          C.LoadPolicyDetail({
            requestId,
            repository,
            policyId: editor.currentPolicy.id,
          }),
        ],
      ]
    }
    case "CompletedSavePolicy":
      return sameRepository(currentRepository(model), message.repository) &&
        model.policyEditor._tag === "PolicyEditorSaving" &&
        model.policyEditor.requestId === message.requestId
        ? closeAndRefresh(
            evo(model, {
              policyEditor: () =>
                PolicyEditorState.cases.PolicyEditorClosed.make({}),
              statusMessage: () => `Saved policy draft ${message.policy.name}.`,
            }),
            "policyEditorDialog",
            message.repository,
          )
        : [model, []]
    case "FailedToSavePolicy": {
      const editor = model.policyEditor
      if (
        !sameRepository(currentRepository(model), message.repository) ||
        editor._tag !== "PolicyEditorSaving" ||
        editor.requestId !== message.requestId
      )
        return [model, []]
      return [
        evo(model, {
          policyEditor: () =>
            message.currentPolicy !== null &&
            message.currentDraftVersion !== null
              ? PolicyEditorState.cases.PolicyEditorConflict.make({
                  draft: editor.draft,
                  sourceEditor: editor.sourceEditor,
                  identity: editor.identity,
                  message: message.message,
                  currentPolicy: message.currentPolicy,
                  currentDraftVersion: message.currentDraftVersion,
                  dirty: editor.dirty,
                })
              : PolicyEditorState.cases.PolicyEditorFailed.make({
                  draft: editor.draft,
                  sourceEditor: editor.sourceEditor,
                  identity: editor.identity,
                  dirty: editor.dirty,
                  message: message.message,
                }),
        }),
        [],
      ]
    }
    case "ValidatedPolicy": {
      const repository = currentRepository(model)
      const editor = model.policyEditor
      if (
        repository === null ||
        (editor._tag !== "PolicyEditorEditing" &&
          editor._tag !== "PolicyEditorFailed") ||
        editor.identity._tag !== "ExistingPolicy" ||
        editor.dirty
      )
        return [model, []]
      const requestId = model.nextRequestId
      const policyId = editor.identity.id
      return [
        evo(model, {
          validation: () =>
            ValidationState.cases.ValidationRunning.make({
              requestId,
              policyId,
            }),
          nextRequestId: (value) => value + 1,
        }),
        [C.ValidatePolicy({ requestId, repository, policyId })],
      ]
    }
    case "CompletedValidatePolicy":
      return sameRepository(currentRepository(model), message.repository) &&
        model.validation._tag === "ValidationRunning" &&
        model.validation.requestId === message.requestId &&
        model.validation.policyId === message.policyId
        ? [
            evo(model, {
              validation: () =>
                ValidationState.cases.ValidationResult.make({
                  result: message.result,
                }),
              statusMessage: () => "The saved policy draft is valid.",
            }),
            [],
          ]
        : [model, []]
    case "FailedToValidatePolicy":
      return sameRepository(currentRepository(model), message.repository) &&
        model.validation._tag === "ValidationRunning" &&
        model.validation.requestId === message.requestId &&
        model.validation.policyId === message.policyId
        ? [
            evo(model, {
              validation: () =>
                ValidationState.cases.ValidationFailed.make({
                  message: message.message,
                }),
            }),
            [],
          ]
        : [model, []]
    case "GotPolicyMenuMessage":
      return updatePolicyMenu(model, message.policyId, message.message)
    case "GotPolicyEditorDialogMessage":
      return updateDialog(model, "policyEditorDialog", message.message)

    case "OpenedPublishPolicy": {
      const item = policy(model, message.policyId)
      return item === null
        ? [model, []]
        : openDialog(
            evo(model, {
              publishing: () =>
                PublishState.cases.PublishConfirming.make({ policy: item }),
            }),
            "publishDialog",
          )
    }
    case "DismissedPublishPolicy":
      return model.publishing._tag === "Publishing"
        ? [model, []]
        : closeDialog(
            evo(model, {
              publishing: () => PublishState.cases.PublishClosed.make({}),
            }),
            "publishDialog",
          )
    case "ConfirmedPublishPolicy": {
      const repository = currentRepository(model)
      const publishing = model.publishing
      if (
        repository === null ||
        (publishing._tag !== "PublishConfirming" &&
          publishing._tag !== "PublishFailed")
      )
        return [model, []]
      const requestId = model.nextRequestId
      return [
        evo(model, {
          publishing: () =>
            PublishState.cases.Publishing.make({
              policy: publishing.policy,
              requestId,
            }),
          nextRequestId: (value) => value + 1,
        }),
        [
          C.PublishPolicy({
            requestId,
            repository,
            policyId: publishing.policy.id,
          }),
        ],
      ]
    }
    case "CompletedPublishPolicy": {
      const publishing = model.publishing
      return sameRepository(currentRepository(model), message.repository) &&
        publishing._tag === "Publishing" &&
        publishing.requestId === message.requestId
        ? closeAndRefresh(
            evo(model, {
              publishing: () => PublishState.cases.PublishClosed.make({}),
              statusMessage: () =>
                `Published ${message.result.policy.name}. Facts: ${message.result.impact.facts.join(", ") || "none"}. Triggers: ${message.result.impact.triggers.join(", ") || "none"}.`,
            }),
            "publishDialog",
            message.repository,
          )
        : [model, []]
    }
    case "FailedToPublishPolicy": {
      const publishing = model.publishing
      return sameRepository(currentRepository(model), message.repository) &&
        publishing._tag === "Publishing" &&
        publishing.requestId === message.requestId
        ? [
            evo(model, {
              publishing: () =>
                PublishState.cases.PublishFailed.make({
                  policy: publishing.policy,
                  message: message.message,
                }),
            }),
            [],
          ]
        : [model, []]
    }
    case "GotPublishDialogMessage":
      return updateDialog(model, "publishDialog", message.message)

    case "OpenedNewRule": {
      const loaded = data(model)
      const first = publishedPolicies(model)[0]
      if (loaded === null || first === undefined) return [model, []]
      return openDialog(
        evo(model, {
          ruleEditor: () =>
            RuleEditorState.cases.RuleEditorEditing.make({
              draft: {
                policyId: first.id,
                label: loaded.labels[0]?.name ?? "",
                onNoMatch: "preserve",
                conflictGroup: "",
                priority: 0,
                enabled: true,
              },
              identity: { _tag: "NewRule" },
            }),
        }),
        "ruleEditorDialog",
      )
    }
    case "OpenedRuleEditor": {
      const item = rule(model, message.ruleId)
      return item === null
        ? [model, []]
        : openDialog(
            evo(model, {
              ruleEditor: () =>
                RuleEditorState.cases.RuleEditorEditing.make({
                  draft: ruleDraftFrom(item),
                  identity: {
                    _tag: "ExistingRule",
                    id: item.id,
                    version: item.version,
                  },
                }),
            }),
            "ruleEditorDialog",
          )
    }
    case "ClosedRuleEditor":
      return model.ruleEditor._tag === "RuleEditorSaving"
        ? [model, []]
        : closeDialog(
            evo(model, {
              ruleEditor: () => RuleEditorState.cases.RuleEditorClosed.make({}),
            }),
            "ruleEditorDialog",
          )
    case "UpdatedRulePolicy":
      return [
        updateRuleDraft(model, (draft) => ({
          ...draft,
          policyId: message.policyId,
        })),
        [],
      ]
    case "UpdatedRuleLabel":
      return [
        updateRuleDraft(model, (draft) => ({ ...draft, label: message.label })),
        [],
      ]
    case "UpdatedRuleNoMatch":
      return [
        updateRuleDraft(model, (draft) => ({
          ...draft,
          onNoMatch: message.onNoMatch,
        })),
        [],
      ]
    case "UpdatedRuleConflictGroup":
      return [
        updateRuleDraft(model, (draft) => ({
          ...draft,
          conflictGroup: message.conflictGroup,
        })),
        [],
      ]
    case "UpdatedRulePriority":
      return [
        updateRuleDraft(model, (draft) => ({
          ...draft,
          priority: message.priority,
        })),
        [],
      ]
    case "SavedRule":
      return saveRule(model, false)
    case "RetriedRuleSave":
      return saveRule(model, true)
    case "ReloadedRuleEditor": {
      const editor = model.ruleEditor
      return editor._tag !== "RuleEditorConflict"
        ? [model, []]
        : [
            evo(model, {
              ruleEditor: () =>
                RuleEditorState.cases.RuleEditorEditing.make({
                  draft: ruleDraftFrom(editor.currentRule),
                  identity: {
                    _tag: "ExistingRule",
                    id: editor.currentRule.id,
                    version: editor.currentRule.version,
                  },
                }),
            }),
            [],
          ]
    }
    case "CompletedSaveRule":
      return sameRepository(currentRepository(model), message.repository) &&
        model.ruleEditor._tag === "RuleEditorSaving" &&
        model.ruleEditor.requestId === message.requestId
        ? closeAndRefresh(
            evo(model, {
              ruleEditor: () => RuleEditorState.cases.RuleEditorClosed.make({}),
              statusMessage: () =>
                `Saved label rule for ${message.rule.label}.`,
            }),
            "ruleEditorDialog",
            message.repository,
          )
        : [model, []]
    case "FailedToSaveRule": {
      const editor = model.ruleEditor
      if (
        !sameRepository(currentRepository(model), message.repository) ||
        editor._tag !== "RuleEditorSaving" ||
        editor.requestId !== message.requestId
      )
        return [model, []]
      const failed = evo(model, {
        ruleEditor: () =>
          message.currentRule === null
            ? RuleEditorState.cases.RuleEditorFailed.make({
                draft: editor.draft,
                identity: editor.identity,
                message: message.message,
              })
            : RuleEditorState.cases.RuleEditorConflict.make({
                draft: editor.draft,
                identity: editor.identity,
                message: message.message,
                currentRule: message.currentRule,
              }),
      })
      return message.revisionConflict
        ? refresh(failed, message.repository)
        : [failed, []]
    }
    case "GotRuleMenuMessage":
      return updateRuleMenu(model, message.ruleId, message.message)
    case "GotRuleEditorDialogMessage":
      return updateDialog(model, "ruleEditorDialog", message.message)
    case "ToggledRule": {
      const repository = currentRepository(model)
      const item = rule(model, message.ruleId)
      if (
        repository === null ||
        item === null ||
        model.rowMutation._tag !== "RowMutationIdle" ||
        (!item.policy.published && !item.enabled)
      )
        return [model, []]
      const requestId = model.nextRequestId
      const enabled = !item.enabled
      if (enabled && !item.policy.published) return [model, []]
      return [
        evo(model, {
          rowMutation: () =>
            RowMutationState.cases.RowMutationSaving.make({
              ruleId: item.id,
              requestId,
              enabled,
            }),
          nextRequestId: (value) => value + 1,
        }),
        [
          C.ToggleRule({
            requestId,
            repository,
            ruleId: item.id,
            version: item.version,
            enabled,
          }),
        ],
      ]
    }
    case "CompletedToggleRule":
      return sameRepository(currentRepository(model), message.repository) &&
        model.rowMutation._tag === "RowMutationSaving" &&
        model.rowMutation.requestId === message.requestId
        ? refresh(
            evo(model, {
              rowMutation: () =>
                RowMutationState.cases.RowMutationIdle.make({}),
            }),
            message.repository,
          )
        : [model, []]
    case "FailedToToggleRule": {
      const mutation = model.rowMutation
      if (
        !sameRepository(currentRepository(model), message.repository) ||
        mutation._tag !== "RowMutationSaving" ||
        mutation.requestId !== message.requestId
      )
        return [model, []]
      const failed = evo(model, {
        rowMutation: () =>
          RowMutationState.cases.RowMutationFailed.make({
            ruleId: message.ruleId,
            enabled: mutation.enabled,
            message: message.message,
            currentRule: message.currentRule,
          }),
      })
      return message.revisionConflict
        ? refresh(failed, message.repository)
        : [failed, []]
    }
    case "RetriedToggleRule": {
      const repository = currentRepository(model)
      const mutation = model.rowMutation
      if (
        repository === null ||
        mutation._tag !== "RowMutationFailed" ||
        mutation.currentRule === null ||
        (mutation.enabled && !mutation.currentRule.policy.published)
      )
        return [model, []]
      const requestId = model.nextRequestId
      return [
        evo(model, {
          rowMutation: () =>
            RowMutationState.cases.RowMutationSaving.make({
              ruleId: mutation.ruleId,
              requestId,
              enabled: mutation.enabled,
            }),
          nextRequestId: (value) => value + 1,
        }),
        [
          C.ToggleRule({
            requestId,
            repository,
            ruleId: mutation.ruleId,
            version: mutation.currentRule.version,
            enabled: mutation.enabled,
          }),
        ],
      ]
    }
    case "DismissedRowMutationError":
      return [
        evo(model, {
          rowMutation: () => RowMutationState.cases.RowMutationIdle.make({}),
        }),
        [],
      ]
    case "OpenedDeleteRule": {
      const item = rule(model, message.ruleId)
      return item === null
        ? [model, []]
        : openDialog(
            evo(model, {
              ruleDeletion: () =>
                RuleDeleteState.cases.RuleDeleteConfirming.make({ rule: item }),
            }),
            "ruleDeleteDialog",
          )
    }
    case "DismissedDeleteRule":
      return model.ruleDeletion._tag === "RuleDeleting"
        ? [model, []]
        : closeDialog(
            evo(model, {
              ruleDeletion: () =>
                RuleDeleteState.cases.RuleDeleteClosed.make({}),
            }),
            "ruleDeleteDialog",
          )
    case "ConfirmedDeleteRule": {
      const repository = currentRepository(model)
      const deletion = model.ruleDeletion
      if (
        repository === null ||
        (deletion._tag !== "RuleDeleteConfirming" &&
          deletion._tag !== "RuleDeleteFailed") ||
        deletion.rule.enabled
      )
        return [model, []]
      const requestId = model.nextRequestId
      return [
        evo(model, {
          ruleDeletion: () =>
            RuleDeleteState.cases.RuleDeleting.make({
              rule: deletion.rule,
              requestId,
            }),
          nextRequestId: (value) => value + 1,
        }),
        [
          C.DeleteRule({
            requestId,
            repository,
            ruleId: deletion.rule.id,
            version: deletion.rule.version,
          }),
        ],
      ]
    }
    case "CompletedDeleteRule":
      return sameRepository(currentRepository(model), message.repository) &&
        model.ruleDeletion._tag === "RuleDeleting" &&
        model.ruleDeletion.requestId === message.requestId
        ? closeAndRefresh(
            evo(model, {
              ruleDeletion: () =>
                RuleDeleteState.cases.RuleDeleteClosed.make({}),
              statusMessage: () => "Deleted label rule.",
            }),
            "ruleDeleteDialog",
            message.repository,
          )
        : [model, []]
    case "FailedToDeleteRule": {
      const deletion = model.ruleDeletion
      if (
        !sameRepository(currentRepository(model), message.repository) ||
        deletion._tag !== "RuleDeleting" ||
        deletion.requestId !== message.requestId
      )
        return [model, []]
      const failed = evo(model, {
        ruleDeletion: () =>
          RuleDeleteState.cases.RuleDeleteFailed.make({
            rule: message.currentRule ?? deletion.rule,
            message: message.message,
          }),
      })
      return message.revisionConflict
        ? refresh(failed, message.repository)
        : [failed, []]
    }
    case "GotRuleDeleteDialogMessage":
      return updateDialog(model, "ruleDeleteDialog", message.message)

    case "OpenedPolicyTest": {
      const repository = currentRepository(model)
      const item = policy(model, message.policyId)
      if (repository === null || item === null) return [model, []]
      const requestId = model.nextRequestId
      return openDialog(
        evo(model, {
          test: () =>
            TestState.cases.TestLoadingCandidates.make({
              policy: item,
              requestId,
            }),
          nextRequestId: (value) => value + 1,
        }),
        "testDialog",
        [
          C.LoadPolicyTestCandidates({
            requestId,
            repository,
            policyId: item.id,
          }),
        ],
      )
    }
    case "LoadedPolicyTestCandidates": {
      const test = model.test
      return sameRepository(currentRepository(model), message.repository) &&
        test._tag === "TestLoadingCandidates" &&
        test.policy.id === message.policyId &&
        test.requestId === message.requestId
        ? [
            evo(model, {
              test: () =>
                TestState.cases.TestConfiguring.make({
                  policy: test.policy,
                  candidates: message.candidates,
                  selectedPullRequest: message.candidates[0]?.number ?? null,
                }),
            }),
            [],
          ]
        : [model, []]
    }
    case "FailedToLoadPolicyTestCandidates": {
      const test = model.test
      return sameRepository(currentRepository(model), message.repository) &&
        test._tag === "TestLoadingCandidates" &&
        test.policy.id === message.policyId &&
        test.requestId === message.requestId
        ? [
            evo(model, {
              test: () =>
                TestState.cases.TestFailed.make({
                  policy: test.policy,
                  candidates: [],
                  selectedPullRequest: null,
                  message: message.message,
                }),
            }),
            [],
          ]
        : [model, []]
    }
    case "SelectedPolicyTestCandidate": {
      const test = model.test
      return test._tag !== "TestConfiguring" && test._tag !== "TestFailed"
        ? [model, []]
        : [
            evo(model, {
              test: () =>
                TestState.cases.TestConfiguring.make({
                  policy: test.policy,
                  candidates: test.candidates,
                  selectedPullRequest: message.pullRequestNumber,
                }),
            }),
            [],
          ]
    }
    case "RanPolicyTest": {
      const repository = currentRepository(model)
      const test = model.test
      if (
        repository === null ||
        (test._tag !== "TestConfiguring" && test._tag !== "TestFailed") ||
        test.selectedPullRequest === null
      )
        return [model, []]
      const requestId = model.nextRequestId
      return [
        evo(model, {
          test: () =>
            TestState.cases.TestRunning.make({
              policy: test.policy,
              candidates: test.candidates,
              selectedPullRequest: test.selectedPullRequest,
              requestId,
            }),
          nextRequestId: (value) => value + 1,
        }),
        [
          C.TestPolicy({
            requestId,
            repository,
            policyId: test.policy.id,
            pullRequestNumber: test.selectedPullRequest,
          }),
        ],
      ]
    }
    case "CompletedPolicyTest": {
      const test = model.test
      return sameRepository(currentRepository(model), message.repository) &&
        test._tag === "TestRunning" &&
        test.requestId === message.requestId
        ? [
            evo(model, {
              test: () =>
                TestState.cases.TestResult.make({
                  policy: test.policy,
                  candidates: test.candidates,
                  selectedPullRequest: test.selectedPullRequest,
                  result: message.result,
                }),
            }),
            [],
          ]
        : [model, []]
    }
    case "FailedPolicyTest": {
      const test = model.test
      return sameRepository(currentRepository(model), message.repository) &&
        test._tag === "TestRunning" &&
        test.requestId === message.requestId
        ? [
            evo(model, {
              test: () =>
                TestState.cases.TestFailed.make({
                  policy: test.policy,
                  candidates: test.candidates,
                  selectedPullRequest: test.selectedPullRequest,
                  message: message.message,
                }),
            }),
            [],
          ]
        : [model, []]
    }
    case "ResetPolicyTest": {
      const test = model.test
      return test._tag !== "TestResult" && test._tag !== "TestFailed"
        ? [model, []]
        : [
            evo(model, {
              test: () =>
                TestState.cases.TestConfiguring.make({
                  policy: test.policy,
                  candidates: test.candidates,
                  selectedPullRequest: test.selectedPullRequest,
                }),
            }),
            [],
          ]
    }
    case "DismissedPolicyTest":
      return model.test._tag === "TestRunning"
        ? [model, []]
        : closeDialog(
            evo(model, { test: () => TestState.cases.TestClosed.make({}) }),
            "testDialog",
          )
    case "GotTestDialogMessage":
      return updateDialog(model, "testDialog", message.message)
  }
}

const savePolicy = (model: Model, retry: boolean): UpdateReturn => {
  const repository = currentRepository(model)
  const editor = model.policyEditor
  if (repository === null) return [model, []]
  if (retry) {
    if (
      editor._tag !== "PolicyEditorConflict" ||
      editor.sourceEditor.program === null
    )
      return [model, []]
    return performPolicySave(
      model,
      repository,
      editor.draft,
      editor.sourceEditor,
      editor.sourceEditor.program,
      {
        _tag: "ExistingPolicy",
        id: editor.currentPolicy.id,
        draftVersion: editor.currentDraftVersion,
      },
    )
  }
  return (editor._tag === "PolicyEditorEditing" ||
    editor._tag === "PolicyEditorFailed") &&
    validPolicyDraft(editor.draft) &&
    editor.sourceEditor.program !== null
    ? performPolicySave(
        model,
        repository,
        editor.draft,
        editor.sourceEditor,
        editor.sourceEditor.program,
        editor.identity,
      )
    : [model, []]
}
const performPolicySave = (
  model: Model,
  repository: Repository,
  draft: PolicyDraft,
  sourceEditor: PolicyCodeEditor.Model,
  program: Program.PolicyProgram,
  identity: Extract<
    Model["policyEditor"],
    { _tag: "PolicyEditorEditing" }
  >["identity"],
): UpdateReturn => {
  const requestId = model.nextRequestId
  return [
    evo(model, {
      policyEditor: () =>
        PolicyEditorState.cases.PolicyEditorSaving.make({
          draft,
          sourceEditor,
          identity,
          dirty: true,
          requestId,
        }),
      nextRequestId: (value) => value + 1,
    }),
    [C.SavePolicy({ requestId, repository, draft, program, identity })],
  ]
}
const saveRule = (model: Model, retry: boolean): UpdateReturn => {
  const repository = currentRepository(model)
  const editor = model.ruleEditor
  if (repository === null) return [model, []]
  if (retry) {
    if (editor._tag !== "RuleEditorConflict") return [model, []]
    return performRuleSave(model, repository, editor.draft, {
      _tag: "ExistingRule",
      id: editor.currentRule.id,
      version: editor.currentRule.version,
    })
  }
  if (editor._tag !== "RuleEditorEditing" && editor._tag !== "RuleEditorFailed")
    return [model, []]
  const selectedPolicy = policy(model, editor.draft.policyId)
  return selectedPolicy === null ||
    selectedPolicy.publishedVersionId === null ||
    editor.draft.label.length === 0
    ? [model, []]
    : performRuleSave(model, repository, editor.draft, editor.identity)
}
const performRuleSave = (
  model: Model,
  repository: Repository,
  draft: RuleDraft,
  identity: Extract<
    Model["ruleEditor"],
    { _tag: "RuleEditorEditing" }
  >["identity"],
): UpdateReturn => {
  const requestId = model.nextRequestId
  return [
    evo(model, {
      ruleEditor: () =>
        RuleEditorState.cases.RuleEditorSaving.make({
          draft,
          identity,
          requestId,
        }),
      nextRequestId: (value) => value + 1,
    }),
    [C.SaveRule({ requestId, repository, draft, identity })],
  ]
}

type DialogField =
  | "policyEditorDialog"
  | "publishDialog"
  | "ruleEditorDialog"
  | "ruleDeleteDialog"
  | "testDialog"
const dialogMessage = (field: DialogField, message: Dialog.Message): Message =>
  field === "policyEditorDialog"
    ? { _tag: "GotPolicyEditorDialogMessage", message }
    : field === "publishDialog"
      ? { _tag: "GotPublishDialogMessage", message }
      : field === "ruleEditorDialog"
        ? { _tag: "GotRuleEditorDialogMessage", message }
        : field === "ruleDeleteDialog"
          ? { _tag: "GotRuleDeleteDialogMessage", message }
          : { _tag: "GotTestDialogMessage", message }
const setDialog = (
  model: Model,
  field: DialogField,
  dialog: Dialog.Model,
): Model =>
  evo(
    model,
    field === "policyEditorDialog"
      ? { policyEditorDialog: () => dialog }
      : field === "publishDialog"
        ? { publishDialog: () => dialog }
        : field === "ruleEditorDialog"
          ? { ruleEditorDialog: () => dialog }
          : field === "ruleDeleteDialog"
            ? { ruleDeleteDialog: () => dialog }
            : { testDialog: () => dialog },
  )
const mapDialogCommands = (
  field: DialogField,
  commands: ReadonlyArray<FoldkitCommand.Command<Dialog.Message>>,
): ReadonlyArray<Command> =>
  FoldkitCommand.mapMessages(commands, (message) =>
    dialogMessage(field, message),
  )
const openDialog = (
  model: Model,
  field: DialogField,
  commands: ReadonlyArray<Command> = [],
): UpdateReturn => {
  const [dialog, childCommands] = Dialog.open(model[field])
  return [
    setDialog(model, field, dialog),
    [...commands, ...mapDialogCommands(field, childCommands)],
  ]
}
const closeDialog = (model: Model, field: DialogField): UpdateReturn => {
  const [dialog, commands] = Dialog.close(model[field])
  return [setDialog(model, field, dialog), mapDialogCommands(field, commands)]
}
const closeAndRefresh = (
  model: Model,
  field: DialogField,
  repository: Repository,
): UpdateReturn => {
  const [closed, closeCommands] = closeDialog(model, field)
  const [refreshing, refreshCommands] = refresh(closed, repository)
  return [refreshing, [...closeCommands, ...refreshCommands]]
}
const dialogLocked = (model: Model, field: DialogField): boolean => {
  switch (field) {
    case "policyEditorDialog":
      return model.policyEditor._tag === "PolicyEditorSaving"
    case "publishDialog":
      return model.publishing._tag === "Publishing"
    case "ruleEditorDialog":
      return model.ruleEditor._tag === "RuleEditorSaving"
    case "ruleDeleteDialog":
      return model.ruleDeletion._tag === "RuleDeleting"
    case "testDialog":
      return model.test._tag === "TestRunning"
  }
}
const updateDialog = (
  model: Model,
  field: DialogField,
  message: Dialog.Message,
): UpdateReturn => {
  if (dialogLocked(model, field)) return [model, []]
  const [dialog, commands, out] = Dialog.update(model[field], message)
  let next = setDialog(model, field, dialog)
  if (Option.exists(out, (item) => item._tag === "Closed")) {
    next =
      field === "policyEditorDialog"
        ? evo(next, {
            policyEditor: () =>
              PolicyEditorState.cases.PolicyEditorClosed.make({}),
            validation: () => ValidationState.cases.ValidationIdle.make({}),
          })
        : field === "publishDialog"
          ? evo(next, {
              publishing: () => PublishState.cases.PublishClosed.make({}),
            })
          : field === "ruleEditorDialog"
            ? evo(next, {
                ruleEditor: () =>
                  RuleEditorState.cases.RuleEditorClosed.make({}),
              })
            : field === "ruleDeleteDialog"
              ? evo(next, {
                  ruleDeletion: () =>
                    RuleDeleteState.cases.RuleDeleteClosed.make({}),
                })
              : evo(next, { test: () => TestState.cases.TestClosed.make({}) })
  }
  return [next, mapDialogCommands(field, commands)]
}
const updatePolicyMenu = (
  model: Model,
  policyId: PolicyId,
  message: Menu.Message,
): UpdateReturn => {
  const menu = model.policyMenus[policyId]
  if (menu === undefined) return [model, []]
  const [nextMenu, childCommands, out] = PolicyActionMenu.update(menu, message)
  const next = evo(model, {
    policyMenus: (menus) => ({ ...menus, [policyId]: nextMenu }),
  })
  const commands = FoldkitCommand.mapMessages(childCommands, (child) => ({
    _tag: "GotPolicyMenuMessage" as const,
    policyId,
    message: child,
  }))
  if (Option.isNone(out)) return [next, commands]
  const selected: Message =
    out.value.value === "Edit"
      ? { _tag: "OpenedPolicyEditor", policyId }
      : out.value.value === "Test"
        ? { _tag: "OpenedPolicyTest", policyId }
        : { _tag: "OpenedPublishPolicy", policyId }
  const [selectedModel, selectedCommands] = update(next, selected)
  return [selectedModel, [...commands, ...selectedCommands]]
}
const updateRuleMenu = (
  model: Model,
  ruleId: RuleId,
  message: Menu.Message,
): UpdateReturn => {
  const menu = model.ruleMenus[ruleId]
  if (menu === undefined) return [model, []]
  const [nextMenu, childCommands, out] = RuleActionMenu.update(menu, message)
  const next = evo(model, {
    ruleMenus: (menus) => ({ ...menus, [ruleId]: nextMenu }),
  })
  const commands = FoldkitCommand.mapMessages(childCommands, (child) => ({
    _tag: "GotRuleMenuMessage" as const,
    ruleId,
    message: child,
  }))
  if (Option.isNone(out)) return [next, commands]
  const selected: Message =
    out.value.value === "Edit"
      ? { _tag: "OpenedRuleEditor", ruleId }
      : { _tag: "OpenedDeleteRule", ruleId }
  const [selectedModel, selectedCommands] = update(next, selected)
  return [selectedModel, [...commands, ...selectedCommands]]
}
