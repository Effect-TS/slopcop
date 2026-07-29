import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import { Match as M, Option, Schema as S } from "effect"
import { type Command } from "foldkit"

import {
  CreateRule,
  DeleteRule,
  LoadAuditHistory,
  LoadWorkspace,
  RevalidateRule,
  SetRuleState,
  UpdateRule,
} from "./command"
import type { Message } from "./message"
import {
  AuditClosed,
  AuditFailed,
  AuditLoading,
  AuditLoadingMore,
  AuditReady,
  CreatingRule,
  EditingRule,
  EditorClosed,
  type Model,
  NoRuleNotice,
  RuleOperationFailed,
  RuleOperationSucceeded,
  type RuleDraft,
  WorkspaceFailed,
  WorkspaceInactive,
  WorkspaceLoading,
  WorkspaceReady,
} from "./model"

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

const repositoryMatches = (
  model: Model,
  repository: { readonly owner: string; readonly repo: string },
) =>
  model._tag !== "Inactive" &&
  model.repository.owner === repository.owner &&
  model.repository.repo === repository.repo

const pendingMatches = (
  model: Extract<Model, { readonly _tag: "Ready" }>,
  generation: number,
  operation: "create" | "update" | "enable" | "disable" | "validate" | "delete",
  ruleId: typeof LabelingRule.LabelingRuleId.Type | null,
) =>
  model.generation === generation &&
  model.pending?.operation === operation &&
  model.pending.ruleId === ruleId

const draftFromRule = (
  rule: typeof LabelingRuleManagement.PublicLabelingRule.Type,
): RuleDraft => ({
  label: rule.label,
  instructions: rule.instructions,
  mode: rule.mode,
  exclusiveGroup: rule.exclusiveGroup ?? "",
})

const replaceRule = (
  rules: ReadonlyArray<typeof LabelingRuleManagement.PublicLabelingRule.Type>,
  rule: typeof LabelingRuleManagement.PublicLabelingRule.Type,
) => rules.map((candidate) => (candidate.id === rule.id ? rule : candidate))

const updateDraft = (
  model: Extract<Model, { readonly _tag: "Ready" }>,
  change: (draft: RuleDraft) => RuleDraft,
): Model =>
  WorkspaceReady.make({
    ...model,
    editor:
      model.editor._tag === "Creating"
        ? CreatingRule.make({
            draft: change(model.editor.draft),
            error: null,
          })
        : model.editor._tag === "Editing"
          ? EditingRule.make({
              ...model.editor,
              draft: change(model.editor.draft),
              error: null,
            })
          : model.editor,
  })

const validateDraft = (model: Extract<Model, { readonly _tag: "Ready" }>) => {
  if (model.editor._tag === "Closed") return Option.none()
  const draft = model.editor.draft
  const label = model.labels.find(
    (candidate) =>
      candidate.name.toLocaleLowerCase() === draft.label.toLocaleLowerCase(),
  )
  if (label === undefined) {
    return Option.some({
      error: "Select an existing GitHub label.",
      request: Option.none<LabelingRuleManagement.CreateLabelingRuleRequest>(),
    })
  }
  const instructions = draft.instructions.trim()
  if (instructions.length === 0 || instructions.length > 4000) {
    return Option.some({
      error: "Instructions must contain between 1 and 4,000 characters.",
      request: Option.none<LabelingRuleManagement.CreateLabelingRuleRequest>(),
    })
  }
  const exclusiveGroup = draft.exclusiveGroup.trim()
  if (exclusiveGroup.length > 100) {
    return Option.some({
      error: "Exclusive group names cannot exceed 100 characters.",
      request: Option.none<LabelingRuleManagement.CreateLabelingRuleRequest>(),
    })
  }
  const request = S.decodeUnknownOption(
    LabelingRuleManagement.CreateLabelingRuleRequest,
  )({
    label: label.name,
    instructions,
    mode: draft.mode,
    exclusiveGroup: exclusiveGroup.length === 0 ? null : exclusiveGroup,
    enabled: true,
  })
  return Option.some({
    error: Option.isNone(request)
      ? "The rule contains invalid values. Review each field and retry."
      : null,
    request,
  })
}

const setEditorError = (
  model: Extract<Model, { readonly _tag: "Ready" }>,
  error: string,
): Model =>
  WorkspaceReady.make({
    ...model,
    editor:
      model.editor._tag === "Creating"
        ? CreatingRule.make({ ...model.editor, error })
        : model.editor._tag === "Editing"
          ? EditingRule.make({ ...model.editor, error })
          : model.editor,
  })

const auditFilters = (
  audit: Extract<Model, { readonly _tag: "Ready" }>["audit"],
) =>
  audit._tag === "AuditClosed"
    ? { ruleId: null, operation: "all" as const }
    : { ruleId: audit.ruleId, operation: audit.operation }

const loadAudit = (
  model: Extract<Model, { readonly _tag: "Ready" }>,
  filters: {
    readonly ruleId: typeof LabelingRule.LabelingRuleId.Type | null
    readonly operation: typeof LabelingRuleManagement.LabelingRuleAuditFilterOperation.Type
  },
  cursor: typeof LabelingRuleManagement.LabelingRuleAuditCursor.Type | null,
): UpdateReturn => [
  WorkspaceReady.make({
    ...model,
    auditSequence: model.auditSequence + 1,
    audit:
      cursor === null
        ? AuditLoading.make(filters)
        : AuditLoadingMore.make({
            ...filters,
            entries:
              model.audit._tag === "AuditReady"
                ? model.audit.entries
                : model.audit._tag === "AuditLoadingMore"
                  ? model.audit.entries
                  : [],
            cursor,
          }),
  }),
  [
    LoadAuditHistory({
      ...model.repository,
      generation: model.generation,
      requestId: model.auditSequence + 1,
      ...filters,
      cursor,
    }),
  ],
]

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ChangedRoute: ({ owner, repo }) =>
        repositoryMatches(model, { owner, repo })
          ? [model, []]
          : (() => {
              const generation = model.generation + 1
              return [
                WorkspaceLoading.make({
                  repository: { owner, repo },
                  generation,
                }),
                [LoadWorkspace({ owner, repo, generation })],
              ]
            })(),
      LeftRoute: () => [
        WorkspaceInactive.make({ generation: model.generation }),
        [],
      ],
      RequestedWorkspace: () =>
        model._tag === "Inactive"
          ? [model, []]
          : (() => {
              const generation = model.generation + 1
              return [
                WorkspaceLoading.make({
                  repository: model.repository,
                  generation,
                }),
                [LoadWorkspace({ ...model.repository, generation })],
              ]
            })(),
      LoadedWorkspace: ({ owner, repo, generation, revision, rules, labels }) =>
        model.generation === generation &&
        repositoryMatches(model, { owner, repo })
          ? [
              WorkspaceReady.make({
                repository: { owner, repo },
                generation,
                revision,
                rules,
                labels,
                query: "",
                statusFilter: "all",
                editor: EditorClosed.make({}),
                pending: null,
                deletingRuleId: null,
                notice: NoRuleNotice.make({}),
                audit: AuditClosed.make({}),
                auditSequence: 0,
              }),
              [],
            ]
          : [model, []],
      FailedToLoadWorkspace: ({ owner, repo, generation, message }) =>
        model.generation === generation &&
        repositoryMatches(model, { owner, repo })
          ? [
              WorkspaceFailed.make({
                repository: { owner, repo },
                generation,
                message,
              }),
              [],
            ]
          : [model, []],
      ChangedRuleQuery: ({ query }) =>
        model._tag === "Ready"
          ? [WorkspaceReady.make({ ...model, query }), []]
          : [model, []],
      ChangedStatusFilter: ({ statusFilter }) =>
        model._tag === "Ready"
          ? [WorkspaceReady.make({ ...model, statusFilter }), []]
          : [model, []],
      ClickedCreateRule: () =>
        model._tag === "Ready" && model.pending === null
          ? [
              WorkspaceReady.make({
                ...model,
                editor: CreatingRule.make({
                  draft: {
                    label: model.labels[0]?.name ?? "",
                    instructions: "",
                    mode: "add-only",
                    exclusiveGroup: "",
                  },
                  error: null,
                }),
                deletingRuleId: null,
                notice: NoRuleNotice.make({}),
              }),
              [],
            ]
          : [model, []],
      ClickedEditRule: ({ ruleId }) => {
        if (model._tag !== "Ready" || model.pending !== null) return [model, []]
        const rule = model.rules.find((candidate) => candidate.id === ruleId)
        return rule === undefined
          ? [model, []]
          : [
              WorkspaceReady.make({
                ...model,
                editor: EditingRule.make({
                  ruleId,
                  version: rule.version,
                  draft: draftFromRule(rule),
                  error: null,
                  conflict: null,
                }),
                deletingRuleId: null,
                notice: NoRuleNotice.make({}),
              }),
              [],
            ]
      },
      ClosedRuleEditor: () =>
        model._tag === "Ready" && model.pending === null
          ? [
              WorkspaceReady.make({ ...model, editor: EditorClosed.make({}) }),
              [],
            ]
          : [model, []],
      ChangedDraftLabel: ({ label }) =>
        model._tag === "Ready"
          ? [updateDraft(model, (draft) => ({ ...draft, label })), []]
          : [model, []],
      ChangedDraftInstructions: ({ instructions }) =>
        model._tag === "Ready"
          ? [updateDraft(model, (draft) => ({ ...draft, instructions })), []]
          : [model, []],
      ChangedDraftMode: ({ mode }) =>
        model._tag === "Ready"
          ? [updateDraft(model, (draft) => ({ ...draft, mode })), []]
          : [model, []],
      ChangedDraftExclusiveGroup: ({ exclusiveGroup }) =>
        model._tag === "Ready"
          ? [updateDraft(model, (draft) => ({ ...draft, exclusiveGroup })), []]
          : [model, []],
      SubmittedRule: () => {
        if (
          model._tag !== "Ready" ||
          model.pending !== null ||
          model.editor._tag === "Closed"
        ) {
          return [model, []]
        }
        const validation = validateDraft(model)
        if (
          Option.isNone(validation) ||
          Option.isNone(validation.value.request)
        ) {
          return [
            setEditorError(
              model,
              Option.isSome(validation)
                ? (validation.value.error ?? "The rule is invalid.")
                : "The rule is invalid.",
            ),
            [],
          ]
        }
        const request = validation.value.request.value
        if (model.editor._tag === "Creating") {
          return [
            WorkspaceReady.make({
              ...model,
              pending: { operation: "create", ruleId: null },
            }),
            [
              CreateRule({
                ...model.repository,
                generation: model.generation,
                request,
              }),
            ],
          ]
        }
        const { enabled: _enabled, ...changes } = request
        return [
          WorkspaceReady.make({
            ...model,
            pending: { operation: "update", ruleId: model.editor.ruleId },
          }),
          [
            UpdateRule({
              ...model.repository,
              generation: model.generation,
              ruleId: model.editor.ruleId,
              request: { ...changes, version: model.editor.version },
            }),
          ],
        ]
      },
      UsedLatestRule: () =>
        model._tag === "Ready" &&
        model.editor._tag === "Editing" &&
        model.editor.conflict !== null
          ? [
              WorkspaceReady.make({
                ...model,
                editor: EditingRule.make({
                  ...model.editor,
                  version: model.editor.conflict.version,
                  draft: draftFromRule(model.editor.conflict),
                  error: null,
                  conflict: null,
                }),
              }),
              [],
            ]
          : [model, []],
      CreatedRule: ({ owner, repo, generation, rule }) =>
        model._tag === "Ready" &&
        repositoryMatches(model, { owner, repo }) &&
        pendingMatches(model, generation, "create", null)
          ? [
              WorkspaceReady.make({
                ...model,
                rules: [...model.rules, rule],
                editor: EditorClosed.make({}),
                pending: null,
                notice: RuleOperationSucceeded.make({
                  message: `Created the rule for '${rule.label}'.`,
                }),
              }),
              [],
            ]
          : [model, []],
      UpdatedRule: ({ owner, repo, generation, operation, rule }) =>
        model._tag === "Ready" &&
        repositoryMatches(model, { owner, repo }) &&
        pendingMatches(model, generation, operation, rule.id)
          ? [
              WorkspaceReady.make({
                ...model,
                rules: replaceRule(model.rules, rule),
                editor:
                  operation === "update" ? EditorClosed.make({}) : model.editor,
                pending: null,
                notice: RuleOperationSucceeded.make({
                  message:
                    operation === "validate" &&
                    rule.validationStatus === "missing"
                      ? `The '${rule.label}' label is missing. SlopCop disabled this rule.`
                      : `${rule.label}: ${operation} completed.`,
                }),
              }),
              [],
            ]
          : [model, []],
      FailedRuleOperation: ({
        owner,
        repo,
        generation,
        operation,
        ruleId,
        message,
        currentRule,
      }) => {
        if (
          model._tag !== "Ready" ||
          !repositoryMatches(model, { owner, repo }) ||
          !pendingMatches(model, generation, operation, ruleId)
        ) {
          return [model, []]
        }
        const rules =
          currentRule === null
            ? model.rules
            : replaceRule(model.rules, currentRule)
        if (
          operation === "update" &&
          currentRule !== null &&
          model.editor._tag === "Editing" &&
          model.editor.ruleId === ruleId
        ) {
          return [
            WorkspaceReady.make({
              ...model,
              rules,
              pending: null,
              editor: EditingRule.make({
                ...model.editor,
                version: currentRule.version,
                error: message,
                conflict: currentRule,
              }),
            }),
            [],
          ]
        }
        return [
          WorkspaceReady.make({
            ...model,
            rules,
            pending: null,
            deletingRuleId: null,
            notice: RuleOperationFailed.make({ message }),
          }),
          [],
        ]
      },
      RequestedRuleState: ({ ruleId, enabled }) => {
        if (model._tag !== "Ready" || model.pending !== null) return [model, []]
        const rule = model.rules.find((candidate) => candidate.id === ruleId)
        if (rule === undefined || rule.enabled === enabled) return [model, []]
        const operation = enabled ? "enable" : "disable"
        return [
          WorkspaceReady.make({
            ...model,
            pending: { operation, ruleId },
            notice: NoRuleNotice.make({}),
          }),
          [
            SetRuleState({
              ...model.repository,
              generation: model.generation,
              ruleId,
              version: rule.version,
              operation,
            }),
          ],
        ]
      },
      RequestedRuleValidation: ({ ruleId }) => {
        if (model._tag !== "Ready" || model.pending !== null) return [model, []]
        const rule = model.rules.find((candidate) => candidate.id === ruleId)
        return rule === undefined
          ? [model, []]
          : [
              WorkspaceReady.make({
                ...model,
                pending: { operation: "validate", ruleId },
                notice: NoRuleNotice.make({}),
              }),
              [
                RevalidateRule({
                  ...model.repository,
                  generation: model.generation,
                  ruleId,
                  version: rule.version,
                }),
              ],
            ]
      },
      RequestedRuleDeletion: ({ ruleId }) =>
        model._tag === "Ready" &&
        model.pending === null &&
        model.rules.some((rule) => rule.id === ruleId && !rule.enabled)
          ? [
              WorkspaceReady.make({
                ...model,
                deletingRuleId: ruleId,
                editor: EditorClosed.make({}),
              }),
              [],
            ]
          : [model, []],
      CancelledRuleDeletion: () =>
        model._tag === "Ready" && model.pending === null
          ? [WorkspaceReady.make({ ...model, deletingRuleId: null }), []]
          : [model, []],
      ConfirmedRuleDeletion: () => {
        if (
          model._tag !== "Ready" ||
          model.pending !== null ||
          model.deletingRuleId === null
        ) {
          return [model, []]
        }
        const rule = model.rules.find(
          (candidate) => candidate.id === model.deletingRuleId,
        )
        return rule === undefined || rule.enabled
          ? [model, []]
          : [
              WorkspaceReady.make({
                ...model,
                pending: { operation: "delete", ruleId: rule.id },
                notice: NoRuleNotice.make({}),
              }),
              [
                DeleteRule({
                  ...model.repository,
                  generation: model.generation,
                  ruleId: rule.id,
                  version: rule.version,
                }),
              ],
            ]
      },
      DeletedRule: ({ owner, repo, generation, ruleId }) =>
        model._tag === "Ready" &&
        repositoryMatches(model, { owner, repo }) &&
        pendingMatches(model, generation, "delete", ruleId)
          ? [
              WorkspaceReady.make({
                ...model,
                rules: model.rules.filter((rule) => rule.id !== ruleId),
                pending: null,
                deletingRuleId: null,
                notice: RuleOperationSucceeded.make({
                  message: "The disabled rule was permanently deleted.",
                }),
              }),
              [],
            ]
          : [model, []],
      DismissedNotice: () =>
        model._tag === "Ready"
          ? [
              WorkspaceReady.make({ ...model, notice: NoRuleNotice.make({}) }),
              [],
            ]
          : [model, []],
      OpenedAuditHistory: () =>
        model._tag === "Ready" && model.audit._tag === "AuditClosed"
          ? loadAudit(model, { ruleId: null, operation: "all" }, null)
          : [model, []],
      ClosedAuditHistory: () =>
        model._tag === "Ready"
          ? [WorkspaceReady.make({ ...model, audit: AuditClosed.make({}) }), []]
          : [model, []],
      RetriedAuditHistory: () =>
        model._tag === "Ready" &&
        model.audit._tag !== "AuditClosed" &&
        model.audit._tag !== "AuditLoading" &&
        model.audit._tag !== "AuditLoadingMore"
          ? loadAudit(model, auditFilters(model.audit), null)
          : [model, []],
      ChangedAuditRule: ({ ruleId }) =>
        model._tag === "Ready" && model.audit._tag !== "AuditClosed"
          ? loadAudit(model, { ruleId, operation: model.audit.operation }, null)
          : [model, []],
      ChangedAuditOperation: ({ operation }) =>
        model._tag === "Ready" && model.audit._tag !== "AuditClosed"
          ? loadAudit(model, { ruleId: model.audit.ruleId, operation }, null)
          : [model, []],
      RequestedMoreAuditHistory: () =>
        model._tag === "Ready" &&
        model.audit._tag === "AuditReady" &&
        model.audit.nextCursor !== null
          ? loadAudit(model, auditFilters(model.audit), model.audit.nextCursor)
          : [model, []],
      LoadedAuditHistory: ({
        owner,
        repo,
        generation,
        requestId,
        ruleId,
        operation,
        cursor,
        entries,
        nextCursor,
      }) => {
        if (
          model._tag !== "Ready" ||
          model.generation !== generation ||
          model.auditSequence !== requestId ||
          !repositoryMatches(model, { owner, repo }) ||
          model.audit._tag === "AuditClosed" ||
          model.audit.ruleId !== ruleId ||
          model.audit.operation !== operation
        ) {
          return [model, []]
        }
        if (cursor === null && model.audit._tag === "AuditLoading") {
          return [
            WorkspaceReady.make({
              ...model,
              audit: AuditReady.make({
                ...auditFilters(model.audit),
                entries,
                nextCursor,
              }),
            }),
            [],
          ]
        }
        if (
          cursor !== null &&
          model.audit._tag === "AuditLoadingMore" &&
          model.audit.cursor === cursor
        ) {
          return [
            WorkspaceReady.make({
              ...model,
              audit: AuditReady.make({
                ...auditFilters(model.audit),
                entries: [...model.audit.entries, ...entries],
                nextCursor,
              }),
            }),
            [],
          ]
        }
        return [model, []]
      },
      FailedToLoadAuditHistory: ({
        owner,
        repo,
        generation,
        requestId,
        ruleId,
        operation,
        cursor,
        message,
      }) => {
        if (
          model._tag !== "Ready" ||
          model.generation !== generation ||
          model.auditSequence !== requestId ||
          !repositoryMatches(model, { owner, repo }) ||
          model.audit._tag === "AuditClosed" ||
          model.audit.ruleId !== ruleId ||
          model.audit.operation !== operation
        ) {
          return [model, []]
        }
        if (cursor === null && model.audit._tag === "AuditLoading") {
          return [
            WorkspaceReady.make({
              ...model,
              audit: AuditFailed.make({
                ...auditFilters(model.audit),
                message,
              }),
            }),
            [],
          ]
        }
        if (
          cursor !== null &&
          model.audit._tag === "AuditLoadingMore" &&
          model.audit.cursor === cursor
        ) {
          return [
            WorkspaceReady.make({
              ...model,
              audit: AuditReady.make({
                ...auditFilters(model.audit),
                entries: model.audit.entries,
                nextCursor: model.audit.cursor,
              }),
              notice: RuleOperationFailed.make({ message }),
            }),
            [],
          ]
        }
        return [model, []]
      },
    }),
  )
