import type * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { Input, Select, Textarea } from "@foldkit/ui"
import * as DateTime from "effect/DateTime"
import { Submodel } from "foldkit"
import { type Html, html } from "foldkit/html"

import { repositoriesRouter } from "../../route"
import {
  CancelledRuleDeletion,
  ChangedDraftExclusiveGroup,
  ChangedDraftInstructions,
  ChangedDraftLabel,
  ChangedDraftMode,
  ChangedAuditOperation,
  ChangedAuditRule,
  ChangedRuleQuery,
  ChangedStatusFilter,
  ClickedCreateRule,
  ClickedEditRule,
  ClosedAuditHistory,
  ClosedRuleEditor,
  ConfirmedRuleDeletion,
  DismissedNotice,
  OpenedAuditHistory,
  type Message,
  RequestedRuleDeletion,
  RequestedRuleState,
  RequestedRuleValidation,
  RequestedMoreAuditHistory,
  RequestedWorkspace,
  RetriedAuditHistory,
  SubmittedRule,
  UsedLatestRule,
} from "./message"
import type { Model, RuleDraft, WorkspaceReady } from "./model"

type Ready = typeof WorkspaceReady.Type
type Rule = typeof LabelingRuleManagement.PublicLabelingRule.Type

const fieldLabelClass =
  "mb-2 block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)]"
const fieldClass =
  "w-full border border-[var(--line)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 disabled:cursor-wait disabled:opacity-60"
const secondaryButtonClass =
  "border border-[var(--line)] bg-[var(--card)] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition hover:border-[var(--blue)] hover:text-[var(--blue-dark)] disabled:cursor-wait disabled:opacity-50"

const rulePending = (model: Ready, rule: Rule) =>
  model.pending?.ruleId === rule.id

const statusBadge = (rule: Rule): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Class(
        rule.enabled
          ? "border border-[var(--green)] bg-[var(--green-soft)] px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-[var(--green-dark)]"
          : "border border-[var(--line)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-[var(--muted-ink)]",
      ),
    ],
    [rule.enabled ? "Active" : "Disabled"],
  )
}

const validationBadge = (rule: Rule): Html => {
  const h = html<Message>()
  const className =
    rule.validationStatus === "valid"
      ? "border-[var(--green)] text-[var(--green-dark)]"
      : rule.validationStatus === "missing"
        ? "border-[var(--coral)] text-[var(--coral-dark)]"
        : "border-[var(--line)] text-[var(--muted-ink)]"
  return h.span(
    [
      h.Class(
        `border bg-[var(--card)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${className}`,
      ),
    ],
    [`Label ${rule.validationStatus}`],
  )
}

const deleteConfirmation = (model: Ready): Html => {
  const h = html<Message>()
  const pending = model.pending?.operation === "delete"
  return h.div(
    [
      h.Role("alert"),
      h.Class(
        "mt-4 border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] p-4",
      ),
    ],
    [
      h.p([h.Class("text-sm font-bold")], ["Permanently delete this rule?"]),
      h.p(
        [h.Class("mt-1 text-xs leading-5 text-[var(--muted-ink)]")],
        ["Its audit records remain, but the rule cannot be restored."],
      ),
      h.div(
        [h.Class("mt-3 flex flex-wrap gap-2")],
        [
          h.button(
            [
              h.Type("button"),
              h.OnClick(ConfirmedRuleDeletion()),
              h.Disabled(pending),
              h.Class(
                "border border-[var(--coral)] bg-[var(--coral)] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-white disabled:cursor-wait disabled:opacity-60",
              ),
            ],
            [pending ? "Deleting..." : "Delete permanently"],
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(CancelledRuleDeletion()),
              h.Disabled(pending),
              h.Class(secondaryButtonClass),
            ],
            ["Cancel"],
          ),
        ],
      ),
    ],
  )
}

const ruleCard = (model: Ready, rule: Rule): Html => {
  const h = html<Message>()
  const pending = rulePending(model, rule)
  return h.article(
    [
      h.Class(
        "border border-[var(--line)] bg-[var(--card)] p-5 shadow-[4px_4px_0_var(--shadow)]",
      ),
    ],
    [
      h.div(
        [
          h.Class(
            "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
          ),
        ],
        [
          h.div(
            [h.Class("min-w-0")],
            [
              h.div(
                [h.Class("flex flex-wrap items-center gap-2")],
                [
                  h.span(
                    [
                      h.AriaHidden(true),
                      h.Class("size-3 border border-black/20"),
                      h.Style({
                        backgroundColor: `#${model.labels.find((label) => label.name.toLocaleLowerCase() === rule.label.toLocaleLowerCase())?.color ?? "808080"}`,
                      }),
                    ],
                    [],
                  ),
                  h.h2(
                    [h.Class("break-all font-mono text-lg font-black")],
                    [rule.label],
                  ),
                  statusBadge(rule),
                  validationBadge(rule),
                ],
              ),
              h.p(
                [
                  h.Class(
                    "mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]",
                  ),
                ],
                [rule.instructions],
              ),
              h.div(
                [
                  h.Class(
                    "mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted-ink)]",
                  ),
                ],
                [
                  h.span([], [`Mode: ${rule.mode}`]),
                  h.span(
                    [],
                    [`Exclusive group: ${rule.exclusiveGroup ?? "none"}`],
                  ),
                  h.span([], [`Version ${rule.version}`]),
                ],
              ),
            ],
          ),
          h.div(
            [
              h.Class(
                "flex shrink-0 flex-wrap gap-2 sm:max-w-64 sm:justify-end",
              ),
            ],
            [
              h.button(
                [
                  h.Type("button"),
                  h.OnClick(ClickedEditRule({ ruleId: rule.id })),
                  h.Disabled(model.pending !== null),
                  h.Class(secondaryButtonClass),
                ],
                ["Edit"],
              ),
              h.button(
                [
                  h.Type("button"),
                  h.OnClick(RequestedRuleValidation({ ruleId: rule.id })),
                  h.Disabled(model.pending !== null),
                  h.Class(secondaryButtonClass),
                ],
                [
                  pending && model.pending?.operation === "validate"
                    ? "Checking..."
                    : "Revalidate",
                ],
              ),
              h.button(
                [
                  h.Type("button"),
                  h.OnClick(
                    RequestedRuleState({
                      ruleId: rule.id,
                      enabled: !rule.enabled,
                    }),
                  ),
                  h.Disabled(model.pending !== null),
                  h.Class(
                    rule.enabled
                      ? secondaryButtonClass
                      : "border border-[var(--green)] bg-[var(--green)] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-white disabled:cursor-wait disabled:opacity-50",
                  ),
                ],
                [
                  pending
                    ? `${model.pending?.operation ?? "Updating"}...`
                    : rule.enabled
                      ? "Disable"
                      : "Enable",
                ],
              ),
              ...(rule.enabled
                ? []
                : [
                    h.button(
                      [
                        h.Type("button"),
                        h.OnClick(RequestedRuleDeletion({ ruleId: rule.id })),
                        h.Disabled(model.pending !== null),
                        h.Class(
                          "border border-[var(--coral)] bg-[var(--card)] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--coral-dark)] hover:bg-[var(--coral)] hover:text-white disabled:cursor-wait disabled:opacity-50",
                        ),
                      ],
                      ["Delete"],
                    ),
                  ]),
            ],
          ),
        ],
      ),
      ...(model.deletingRuleId === rule.id ? [deleteConfirmation(model)] : []),
    ],
  )
}

const editorField = (
  label: string,
  id: string,
  value: string,
  onInput: (value: string) => Message,
  options: ReadonlyArray<string>,
  disabled: boolean,
): Html => {
  const h = html<Message>()
  return Input.view<Message>({
    id,
    value,
    onInput,
    isDisabled: disabled,
    toView: (attributes) =>
      h.div(
        [],
        [
          h.label([...attributes.label, h.Class(fieldLabelClass)], [label]),
          h.input([
            ...attributes.input,
            h.List(`${id}-options`),
            h.Autocomplete("off"),
            h.Class(fieldClass),
          ]),
          h.datalist(
            [h.Id(`${id}-options`)],
            options.map((option) => h.option([h.Value(option)], [])),
          ),
          h.p(
            [...attributes.description, h.Class("sr-only")],
            [`${label} suggestions`],
          ),
        ],
      ),
  })
}

const editorView = (model: Ready): Html => {
  const h = html<Message>()
  if (model.editor._tag === "Closed") return h.div([], [])
  const editor = model.editor
  const draft: RuleDraft = editor.draft
  const saving =
    model.pending?.operation === "create" ||
    model.pending?.operation === "update"
  const groups = Array.from(
    new Set(
      model.rules.flatMap((rule) =>
        rule.exclusiveGroup === null ? [] : [rule.exclusiveGroup],
      ),
    ),
  ).sort((left, right) => left.localeCompare(right))

  return h.aside(
    [
      h.AriaLabel(
        editor._tag === "Creating"
          ? "Create labeling rule"
          : "Edit labeling rule",
      ),
      h.Class(
        "border border-[var(--blue)] bg-[var(--paper)] shadow-[6px_6px_0_var(--shadow)] xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto",
      ),
    ],
    [
      h.div(
        [
          h.Class(
            "flex items-start justify-between gap-4 border-b border-[var(--line)] p-5",
          ),
        ],
        [
          h.div(
            [],
            [
              h.p(
                [
                  h.Class(
                    "font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--blue-dark)]",
                  ),
                ],
                [editor._tag === "Creating" ? "New rule" : "Rule editor"],
              ),
              h.h2(
                [h.Class("mt-1 text-xl font-black")],
                [
                  editor._tag === "Creating"
                    ? "Create labeling rule"
                    : `Edit ${draft.label}`,
                ],
              ),
            ],
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(ClosedRuleEditor()),
              h.Disabled(saving),
              h.AriaLabel("Close rule editor"),
              h.Class(
                "px-2 py-1 font-mono text-lg hover:text-[var(--blue-dark)] disabled:opacity-50",
              ),
            ],
            ["x"],
          ),
        ],
      ),
      h.form(
        [h.OnSubmit(SubmittedRule()), h.Class("space-y-5 p-5")],
        [
          ...(editor.error === null
            ? []
            : [
                h.div(
                  [
                    h.Role("alert"),
                    h.Class(
                      "border border-[var(--coral)] bg-[var(--coral-soft)] p-3 text-sm",
                    ),
                  ],
                  [editor.error],
                ),
              ]),
          ...(editor._tag === "Editing" && editor.conflict !== null
            ? [
                h.div(
                  [
                    h.Class(
                      "border border-[var(--blue)] bg-[var(--blue-soft)] p-3 text-sm",
                    ),
                  ],
                  [
                    h.p(
                      [h.Class("font-bold")],
                      ["A newer server version was loaded."],
                    ),
                    h.p(
                      [
                        h.Class(
                          "mt-1 text-xs leading-5 text-[var(--muted-ink)]",
                        ),
                      ],
                      [
                        `Latest: ${editor.conflict.label}, ${editor.conflict.mode}, version ${editor.conflict.version}. Your draft remains in the form.`,
                      ],
                    ),
                    h.button(
                      [
                        h.Type("button"),
                        h.OnClick(UsedLatestRule()),
                        h.Class(`${secondaryButtonClass} mt-3`),
                      ],
                      ["Use latest values"],
                    ),
                  ],
                ),
              ]
            : []),
          editorField(
            "GitHub label",
            "rule-label",
            draft.label,
            (label) => ChangedDraftLabel({ label }),
            model.labels.map((label) => label.name),
            saving,
          ),
          Textarea.view<Message>({
            id: "rule-instructions",
            value: draft.instructions,
            rows: 8,
            isDisabled: saving,
            onInput: (instructions) =>
              ChangedDraftInstructions({ instructions }),
            toView: (attributes) =>
              h.div(
                [],
                [
                  h.label(
                    [...attributes.label, h.Class(fieldLabelClass)],
                    ["Classification instructions"],
                  ),
                  h.textarea(
                    [
                      ...attributes.textarea,
                      h.Maxlength(4000),
                      h.Class(`${fieldClass} resize-y`),
                    ],
                    [],
                  ),
                  h.p(
                    [
                      ...attributes.description,
                      h.Class("mt-1 text-xs text-[var(--muted-ink)]"),
                    ],
                    [
                      `${draft.instructions.length}/4000 characters. Describe when this label belongs on a pull request.`,
                    ],
                  ),
                ],
              ),
          }),
          Select.view<Message>({
            id: "rule-mode",
            value: draft.mode,
            isDisabled: saving,
            onChange: (mode) =>
              mode === "add-only" || mode === "reconcile"
                ? ChangedDraftMode({ mode })
                : ChangedDraftMode({ mode: draft.mode }),
            toView: (attributes) =>
              h.div(
                [],
                [
                  h.label(
                    [...attributes.label, h.Class(fieldLabelClass)],
                    ["Mode"],
                  ),
                  h.select(
                    [...attributes.select, h.Class(fieldClass)],
                    [
                      h.option([h.Value("add-only")], ["Add only"]),
                      h.option([h.Value("reconcile")], ["Reconcile"]),
                    ],
                  ),
                  h.p(
                    [
                      ...attributes.description,
                      h.Class("mt-1 text-xs leading-5 text-[var(--muted-ink)]"),
                    ],
                    [
                      draft.mode === "add-only"
                        ? "Adds the label when matched and never removes it."
                        : "Adds the label when matched and removes it when no longer matched.",
                    ],
                  ),
                ],
              ),
          }),
          editorField(
            "Exclusive group (optional)",
            "rule-exclusive-group",
            draft.exclusiveGroup,
            (exclusiveGroup) => ChangedDraftExclusiveGroup({ exclusiveGroup }),
            groups,
            saving,
          ),
          h.div(
            [
              h.Class(
                "flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-5",
              ),
            ],
            [
              h.button(
                [
                  h.Type("button"),
                  h.OnClick(ClosedRuleEditor()),
                  h.Disabled(saving),
                  h.Class(secondaryButtonClass),
                ],
                ["Cancel"],
              ),
              h.button(
                [
                  h.Type("submit"),
                  h.Disabled(saving || model.labels.length === 0),
                  h.Class(
                    "border border-[var(--blue)] bg-[var(--blue)] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-[var(--blue-dark)] disabled:cursor-wait disabled:opacity-50",
                  ),
                ],
                [
                  saving
                    ? "Saving..."
                    : editor._tag === "Creating"
                      ? "Create rule"
                      : "Save changes",
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

const actorName = (actor: string) =>
  actor.replace(/^admin:cloudflare-access:/, "").replace(/^system:/, "System: ")

const auditLabel = (
  entry: typeof LabelingRuleManagement.PublicLabelingRuleAuditEntry.Type,
) => entry.after?.label ?? entry.before?.label ?? entry.ruleId

const changedFields = (
  entry: typeof LabelingRuleManagement.PublicLabelingRuleAuditEntry.Type,
) => {
  if (entry.before === null || entry.after === null) return []
  const fields: ReadonlyArray<
    keyof typeof LabelingRuleManagement.PublicLabelingRuleAuditValue.Type
  > = [
    "label",
    "instructions",
    "mode",
    "exclusiveGroup",
    "enabled",
    "validationStatus",
    "validatedAt",
  ]
  return fields.filter(
    (field) => String(entry.before?.[field]) !== String(entry.after?.[field]),
  )
}

const auditView = (model: Ready): Html => {
  const h = html<Message>()
  const audit = model.audit
  if (audit._tag === "AuditClosed") return h.div([], [])
  const entries =
    audit._tag === "AuditReady" || audit._tag === "AuditLoadingMore"
      ? audit.entries
      : []
  const selectedRuleId = audit.ruleId ?? "all"
  const ruleOptionMap = new Map([
    ...model.rules.map((rule) => [rule.id, rule.label] as const),
    ...entries.map((entry) => [entry.ruleId, auditLabel(entry)] as const),
  ])
  if (audit.ruleId !== null && !ruleOptionMap.has(audit.ruleId)) {
    ruleOptionMap.set(audit.ruleId, audit.ruleId)
  }
  const ruleOptions = Array.from(ruleOptionMap.entries()).sort((left, right) =>
    left[1].localeCompare(right[1]),
  )

  return h.section(
    [
      h.AriaLabel("Label rule audit history"),
      h.Class(
        "mt-8 border border-[var(--line)] bg-[var(--paper)] shadow-[5px_5px_0_var(--shadow)]",
      ),
    ],
    [
      h.div(
        [
          h.Class(
            "flex flex-col gap-4 border-b border-[var(--line)] p-5 sm:flex-row sm:items-start sm:justify-between",
          ),
        ],
        [
          h.div(
            [],
            [
              h.p(
                [
                  h.Class(
                    "font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--green-dark)]",
                  ),
                ],
                ["Repository record"],
              ),
              h.h2([h.Class("mt-1 text-2xl font-black")], ["Rule history"]),
              h.p(
                [h.Class("mt-1 text-sm text-[var(--muted-ink)]")],
                ["Configuration changes, validation checks, and deletions."],
              ),
            ],
          ),
          h.div(
            [h.Class("flex flex-wrap gap-2")],
            [
              h.button(
                [
                  h.Type("button"),
                  h.OnClick(RetriedAuditHistory()),
                  h.Disabled(
                    audit._tag === "AuditLoading" ||
                      audit._tag === "AuditLoadingMore",
                  ),
                  h.Class(secondaryButtonClass),
                ],
                ["Refresh"],
              ),
              h.button(
                [
                  h.Type("button"),
                  h.OnClick(ClosedAuditHistory()),
                  h.Class(secondaryButtonClass),
                ],
                ["Close history"],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [
          h.Class(
            "grid gap-4 border-b border-[var(--line)] p-5 sm:grid-cols-2",
          ),
        ],
        [
          Select.view<Message>({
            id: "audit-rule-filter",
            value: selectedRuleId,
            onChange: (value) =>
              ChangedAuditRule({
                ruleId:
                  value === "all"
                    ? null
                    : (model.rules.find((rule) => rule.id === value)?.id ??
                      entries.find((entry) => entry.ruleId === value)?.ruleId ??
                      audit.ruleId),
              }),
            toView: (attributes) =>
              h.div(
                [],
                [
                  h.label(
                    [...attributes.label, h.Class(fieldLabelClass)],
                    ["Rule"],
                  ),
                  h.select(
                    [...attributes.select, h.Class(fieldClass)],
                    [
                      h.option([h.Value("all")], ["All rules"]),
                      ...ruleOptions.map(([id, label]) =>
                        h.option([h.Value(id)], [label]),
                      ),
                    ],
                  ),
                  h.p(
                    [...attributes.description, h.Class("sr-only")],
                    ["Filter history by rule"],
                  ),
                ],
              ),
          }),
          Select.view<Message>({
            id: "audit-operation-filter",
            value: audit.operation,
            onChange: (operation) =>
              operation === "create" ||
              operation === "update" ||
              operation === "validate" ||
              operation === "disable" ||
              operation === "delete" ||
              operation === "all"
                ? ChangedAuditOperation({ operation })
                : ChangedAuditOperation({ operation: "all" }),
            toView: (attributes) =>
              h.div(
                [],
                [
                  h.label(
                    [...attributes.label, h.Class(fieldLabelClass)],
                    ["Operation"],
                  ),
                  h.select(
                    [...attributes.select, h.Class(fieldClass)],
                    [
                      h.option([h.Value("all")], ["All operations"]),
                      h.option([h.Value("create")], ["Created"]),
                      h.option([h.Value("update")], ["Updated"]),
                      h.option([h.Value("validate")], ["Validated"]),
                      h.option([h.Value("disable")], ["Disabled"]),
                      h.option([h.Value("delete")], ["Deleted"]),
                    ],
                  ),
                  h.p(
                    [...attributes.description, h.Class("sr-only")],
                    ["Filter history by operation"],
                  ),
                ],
              ),
          }),
        ],
      ),
      ...(audit._tag === "AuditLoading"
        ? [
            h.div(
              [h.AriaLabel("Loading rule history"), h.Class("space-y-3 p-5")],
              Array.from({ length: 3 }, (_, index) =>
                h.div(
                  [
                    h.AriaHidden(true),
                    h.DataAttribute("audit-skeleton", String(index)),
                    h.Class("h-24 animate-pulse bg-[var(--card)] opacity-70"),
                  ],
                  [],
                ),
              ),
            ),
          ]
        : audit._tag === "AuditFailed"
          ? [
              h.div(
                [
                  h.Class(
                    "m-5 border border-[var(--coral)] bg-[var(--coral-soft)] p-4",
                  ),
                ],
                [
                  h.p([h.Role("alert"), h.Class("text-sm")], [audit.message]),
                  h.button(
                    [
                      h.Type("button"),
                      h.OnClick(RetriedAuditHistory()),
                      h.Class(`${secondaryButtonClass} mt-3`),
                    ],
                    ["Try again"],
                  ),
                ],
              ),
            ]
          : entries.length === 0
            ? [
                h.div(
                  [h.Class("p-10 text-center")],
                  [
                    h.p(
                      [h.Class("font-bold")],
                      ["No history matches these filters."],
                    ),
                    h.p(
                      [h.Class("mt-1 text-sm text-[var(--muted-ink)]")],
                      ["Seeded rules may not have creation records."],
                    ),
                  ],
                ),
              ]
            : [
                h.ol(
                  [h.Class("divide-y divide-[var(--line)]")],
                  entries.map((entry) => {
                    const changes = changedFields(entry)
                    return h.li(
                      [h.Class("p-5")],
                      [
                        h.div(
                          [
                            h.Class(
                              "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
                            ),
                          ],
                          [
                            h.div(
                              [],
                              [
                                h.div(
                                  [
                                    h.Class(
                                      "flex flex-wrap items-center gap-2",
                                    ),
                                  ],
                                  [
                                    h.span(
                                      [
                                        h.Class(
                                          "border border-[var(--line)] bg-[var(--card)] px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wider",
                                        ),
                                      ],
                                      [entry.operation],
                                    ),
                                    h.span(
                                      [h.Class("font-mono text-sm font-black")],
                                      [auditLabel(entry)],
                                    ),
                                  ],
                                ),
                                h.p(
                                  [
                                    h.Class(
                                      "mt-2 text-xs text-[var(--muted-ink)]",
                                    ),
                                  ],
                                  [`By ${actorName(entry.actor)}`],
                                ),
                                ...(changes.length === 0
                                  ? []
                                  : [
                                      h.p(
                                        [h.Class("mt-2 text-xs leading-5")],
                                        [`Changed: ${changes.join(", ")}`],
                                      ),
                                    ]),
                              ],
                            ),
                            h.time(
                              [
                                h.Class(
                                  "shrink-0 text-xs text-[var(--muted-ink)]",
                                ),
                              ],
                              [
                                DateTime.toDate(
                                  entry.createdAt,
                                ).toLocaleString(),
                              ],
                            ),
                          ],
                        ),
                      ],
                    )
                  }),
                ),
                ...((audit._tag === "AuditReady" &&
                  audit.nextCursor !== null) ||
                audit._tag === "AuditLoadingMore"
                  ? [
                      h.div(
                        [
                          h.Class(
                            "border-t border-[var(--line)] p-5 text-center",
                          ),
                        ],
                        [
                          h.button(
                            [
                              h.Type("button"),
                              h.OnClick(RequestedMoreAuditHistory()),
                              h.Disabled(audit._tag === "AuditLoadingMore"),
                              h.Class(secondaryButtonClass),
                            ],
                            [
                              audit._tag === "AuditLoadingMore"
                                ? "Loading..."
                                : "Load more",
                            ],
                          ),
                        ],
                      ),
                    ]
                  : []),
              ]),
    ],
  )
}

const readyView = (model: Ready): Html => {
  const h = html<Message>()
  const query = model.query.trim().toLocaleLowerCase()
  const rules = model.rules.filter((rule) => {
    const matchesStatus =
      model.statusFilter === "all" ||
      (model.statusFilter === "active" ? rule.enabled : !rule.enabled)
    const haystack =
      `${rule.label}\n${rule.instructions}\n${rule.exclusiveGroup ?? ""}`.toLocaleLowerCase()
    return matchesStatus && haystack.includes(query)
  })
  return h.div(
    [],
    [
      h.div(
        [
          h.Class(
            model.editor._tag === "Closed"
              ? ""
              : "grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]",
          ),
        ],
        [
          h.div(
            [h.Class("min-w-0")],
            [
              h.div(
                [h.Class("grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]")],
                [
                  Input.view<Message>({
                    id: "rule-search",
                    value: model.query,
                    placeholder: "Search labels, instructions, or groups...",
                    onInput: (query) => ChangedRuleQuery({ query }),
                    toView: (attributes) =>
                      h.div(
                        [],
                        [
                          h.label(
                            [...attributes.label, h.Class(fieldLabelClass)],
                            ["Search rules"],
                          ),
                          h.input([
                            ...attributes.input,
                            h.Autocomplete("off"),
                            h.Class(fieldClass),
                          ]),
                          h.p(
                            [...attributes.description, h.Class("sr-only")],
                            ["Filter labeling rules"],
                          ),
                        ],
                      ),
                  }),
                  Select.view<Message>({
                    id: "rule-status-filter",
                    value: model.statusFilter,
                    onChange: (statusFilter) =>
                      statusFilter === "active" ||
                      statusFilter === "disabled" ||
                      statusFilter === "all"
                        ? ChangedStatusFilter({ statusFilter })
                        : ChangedStatusFilter({ statusFilter: "all" }),
                    toView: (attributes) =>
                      h.div(
                        [],
                        [
                          h.label(
                            [...attributes.label, h.Class(fieldLabelClass)],
                            ["Status"],
                          ),
                          h.select(
                            [...attributes.select, h.Class(fieldClass)],
                            [
                              h.option([h.Value("all")], ["All rules"]),
                              h.option([h.Value("active")], ["Active"]),
                              h.option([h.Value("disabled")], ["Disabled"]),
                            ],
                          ),
                          h.p(
                            [...attributes.description, h.Class("sr-only")],
                            ["Filter rules by status"],
                          ),
                        ],
                      ),
                  }),
                ],
              ),
              ...(model.notice._tag === "NoNotice"
                ? []
                : [
                    h.div(
                      [
                        h.AriaLive("polite"),
                        h.Class(
                          model.notice._tag === "Succeeded"
                            ? "mt-4 flex items-start justify-between gap-3 border-l-4 border-[var(--green)] bg-[var(--green-soft)] px-4 py-3 text-sm"
                            : "mt-4 flex items-start justify-between gap-3 border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm",
                        ),
                      ],
                      [
                        h.span([], [model.notice.message]),
                        h.button(
                          [
                            h.Type("button"),
                            h.OnClick(DismissedNotice()),
                            h.AriaLabel("Dismiss notice"),
                            h.Class("font-mono font-bold"),
                          ],
                          ["x"],
                        ),
                      ],
                    ),
                  ]),
              h.div(
                [h.Class("mt-5 space-y-4")],
                rules.length > 0
                  ? rules.map((rule) => ruleCard(model, rule))
                  : [
                      h.section(
                        [
                          h.Class(
                            "border border-dashed border-[var(--line)] bg-[var(--card)] px-6 py-14 text-center",
                          ),
                        ],
                        [
                          h.h2(
                            [h.Class("text-xl font-black")],
                            [
                              model.rules.length === 0
                                ? "No labeling rules yet"
                                : "No rules match these filters",
                            ],
                          ),
                          h.p(
                            [
                              h.Class(
                                "mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted-ink)]",
                              ),
                            ],
                            [
                              model.rules.length === 0
                                ? "Create the first rule to teach SlopCop when a GitHub label belongs on a pull request."
                                : "Try another search or show all statuses.",
                            ],
                          ),
                        ],
                      ),
                    ],
              ),
            ],
          ),
          ...(model.editor._tag === "Closed" ? [] : [editorView(model)]),
        ],
      ),
      ...(model.audit._tag === "AuditClosed" ? [] : [auditView(model)]),
    ],
  )
}

export const view = Submodel.defineView<Model, Message>((model): Html => {
  const h = html<Message>()
  if (model._tag === "Inactive") return h.div([], [])
  const slug = `${model.repository.owner}/${model.repository.repo}`
  return h.main(
    [h.Class("mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10")],
    [
      h.a(
        [
          h.Href(repositoriesRouter()),
          h.Class(
            "font-mono text-xs font-bold uppercase tracking-wider text-[var(--blue-dark)] hover:underline",
          ),
        ],
        ["Back to repositories"],
      ),
      h.header(
        [
          h.Class(
            "mt-6 flex flex-col gap-5 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between",
          ),
        ],
        [
          h.div(
            [],
            [
              h.p(
                [
                  h.Class(
                    "font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--green-dark)]",
                  ),
                ],
                ["Labeling desk"],
              ),
              h.h1(
                [
                  h.Class(
                    "mt-2 break-all font-mono text-3xl font-black sm:text-4xl",
                  ),
                ],
                [slug],
              ),
              h.p(
                [
                  h.Class(
                    "mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]",
                  ),
                ],
                [
                  "Manage label classification rules. Configuration remains available while repository patrol is paused.",
                ],
              ),
            ],
          ),
          ...(model._tag === "Ready"
            ? [
                h.div(
                  [h.Class("flex flex-wrap gap-2")],
                  [
                    ...(model.audit._tag === "AuditClosed"
                      ? [
                          h.button(
                            [
                              h.Type("button"),
                              h.OnClick(OpenedAuditHistory()),
                              h.Class(secondaryButtonClass),
                            ],
                            ["View history"],
                          ),
                        ]
                      : []),
                    h.button(
                      [
                        h.Type("button"),
                        h.OnClick(ClickedCreateRule()),
                        h.Disabled(
                          model.pending !== null ||
                            model.editor._tag === "Creating",
                        ),
                        h.Class(
                          "shrink-0 border border-[var(--blue)] bg-[var(--blue)] px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0_var(--shadow)] hover:bg-[var(--blue-dark)] disabled:cursor-wait disabled:opacity-50",
                        ),
                      ],
                      ["Create rule"],
                    ),
                  ],
                ),
              ]
            : []),
        ],
      ),
      h.div(
        [h.Class("mt-6")],
        [
          ...(model._tag === "Loading"
            ? [
                h.div(
                  [h.AriaLabel("Loading labeling rules"), h.Class("space-y-4")],
                  Array.from({ length: 3 }, (_, index) =>
                    h.div(
                      [
                        h.AriaHidden(true),
                        h.DataAttribute("skeleton", String(index)),
                        h.Class(
                          "h-40 animate-pulse border border-[var(--line)] bg-[var(--card)] opacity-70",
                        ),
                      ],
                      [],
                    ),
                  ),
                ),
              ]
            : model._tag === "Failed"
              ? [
                  h.section(
                    [
                      h.Class(
                        "border border-[var(--coral)] bg-[var(--coral-soft)] p-6",
                      ),
                    ],
                    [
                      h.h2(
                        [
                          h.Class(
                            "font-mono text-xs font-black uppercase tracking-wider text-[var(--coral-dark)]",
                          ),
                        ],
                        ["Workspace request failed"],
                      ),
                      h.p(
                        [h.Class("mt-2 text-sm text-[var(--muted-ink)]")],
                        [model.message],
                      ),
                      h.button(
                        [
                          h.Type("button"),
                          h.OnClick(RequestedWorkspace()),
                          h.Class(`${secondaryButtonClass} mt-5`),
                        ],
                        ["Try again"],
                      ),
                    ],
                  ),
                ]
              : [readyView(model)]),
        ],
      ),
    ],
  )
})
