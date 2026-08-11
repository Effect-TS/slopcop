import * as Dialog from "@foldkit/ui/dialog"
import * as PolicyManagement from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as RuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import * as PolicyCodeEditor from "../../components/policy-editor"
import * as Icon from "../icon"
import * as M from "./message"
import {
  PolicyAction,
  PolicyActionMenu,
  RuleAction,
  RuleActionMenu,
  type Model,
  type RepositoryData,
  type Tab,
} from "./model"
import { validPolicyDraft } from "./update"

type Policy = typeof PolicyManagement.PublicPolicy.Type
type Rule = typeof RuleManagement.PublicLabelingRule.Type
const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm outline-hidden hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
const secondaryButton =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
const destructiveButton =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
const inputClass =
  "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20"

export const view = Submodel.defineView<Model, M.Message>((model, h) => {
  const dialogOpen =
    model.policyEditorDialog.isOpen ||
    model.publishDialog.isOpen ||
    model.ruleEditorDialog.isOpen ||
    model.ruleDeleteDialog.isOpen ||
    model.testDialog.isOpen
  return h.div(
    [h.Class("w-full self-stretch")],
    [
      h.section(
        [
          h.AriaLabelledBy("auto-labeling-title"),
          h.Inert(dialogOpen),
          h.Class("px-4 py-6 sm:px-6 lg:px-8"),
        ],
        [header(h, model), tabPanel(h, model)],
      ),
      ...modals(h, model),
    ],
  )
})

const header = (h: HtmlBuilder<M.Message>, model: Model): Html =>
  h.div(
    [],
    [
      h.div(
        [
          h.Class(
            "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
          ),
        ],
        [
          h.div(
            [],
            [
              h.p(
                [h.Class("mb-2 font-mono text-xs text-muted-foreground")],
                [repositoryName(model)],
              ),
              h.h2(
                [
                  h.Id("auto-labeling-title"),
                  h.Class("text-2xl font-semibold tracking-tight sm:text-3xl"),
                ],
                ["Auto-labeling"],
              ),
              h.p(
                [
                  h.Class(
                    "mt-2 max-w-2xl text-sm leading-6 text-muted-foreground",
                  ),
                ],
                [
                  "Build reusable policy programs, publish exact versions, and bind labels to published policies.",
                ],
              ),
            ],
          ),
          h.button(
            [
              h.Type("button"),
              ...(model.repository._tag !== "LoadedRepository" ||
              (model.tab === "Label rules" &&
                publishedPolicies(model).length === 0)
                ? [h.Disabled(true)]
                : []),
              h.OnClick(
                model.tab === "Policies"
                  ? M.OpenedNewPolicy()
                  : M.OpenedNewRule(),
              ),
              h.Class(primaryButton),
            ],
            [
              Icon.plus(),
              model.tab === "Policies" ? "New policy" : "New label rule",
            ],
          ),
        ],
      ),
      tabs(h, model.tab),
    ],
  )

const tabs = (h: HtmlBuilder<M.Message>, selected: Tab): Html =>
  h.div(
    [
      h.Role("tablist"),
      h.AriaLabel("Auto-labeling sections"),
      h.Class("mt-6 flex gap-1 border-b"),
    ],
    (["Policies", "Label rules"] as const).map((tab) =>
      h.button(
        [
          h.Type("button"),
          h.Id(tabId(tab)),
          h.Role("tab"),
          h.AriaSelected(selected === tab),
          h.AriaControls(panelId(tab)),
          h.Tabindex(selected === tab ? 0 : -1),
          h.OnClick(M.SelectedTab({ tab })),
          h.OnKeyDownFocus((key) => {
            const target = tabKeyTarget(key, selected)
            return target === null
              ? Option.none()
              : Option.some({
                  focusSelector: `#${tabId(target)}`,
                  message: M.SelectedTab({ tab: target }),
                })
          }),
          h.Class(
            `border-b-2 px-4 py-2 text-sm font-medium ${selected === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`,
          ),
        ],
        [tab],
      ),
    ),
  )
const tabSlug = (tab: Tab) => (tab === "Policies" ? "policies" : "label-rules")
const tabId = (tab: Tab) => `auto-labeling-tab-${tabSlug(tab)}`
const panelId = (tab: Tab) => `auto-labeling-panel-${tabSlug(tab)}`
const tabKeyTarget = (key: string, selected: Tab): Tab | null =>
  key === "Home"
    ? "Policies"
    : key === "End"
      ? "Label rules"
      : key === "ArrowLeft" || key === "ArrowRight"
        ? selected === "Policies"
          ? "Label rules"
          : "Policies"
        : null
const tabPanel = (h: HtmlBuilder<M.Message>, model: Model): Html =>
  h.div(
    [
      h.Id(panelId(model.tab)),
      h.Role("tabpanel"),
      h.AriaLabelledBy(tabId(model.tab)),
      h.Tabindex(0),
    ],
    [
      ...(model.statusMessage === null
        ? []
        : [
            h.div(
              [
                h.Role("status"),
                h.AriaLive("polite"),
                h.Class(
                  "mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success",
                ),
              ],
              [model.statusMessage],
            ),
          ]),
      repositoryView(h, model),
    ],
  )

const repositoryName = (model: Model): string =>
  model.repository._tag === "NoRepository"
    ? "Select a repository"
    : model.repository._tag === "LoadedRepository"
      ? `${model.repository.data.repository.owner}/${model.repository.data.repository.repo}`
      : `${model.repository.repository.owner}/${model.repository.repository.repo}`
const repositoryView = (h: HtmlBuilder<M.Message>, model: Model): Html => {
  switch (model.repository._tag) {
    case "NoRepository":
      return statusPanel(
        h,
        "No repository selected",
        "Choose a repository from the sidebar.",
      )
    case "LoadingRepository":
      return statusPanel(
        h,
        "Loading auto-labeling",
        "Loading policies, rules, activity, audit, and GitHub labels...",
      )
    case "FailedRepository":
      return errorPanel(
        h,
        model.repository.message,
        "Retry",
        M.RetriedRepositoryLoad(),
      )
    case "LoadedRepository":
      return h.div(
        [],
        [
          ...(model.refreshError === null
            ? []
            : [
                errorPanel(
                  h,
                  `${model.refreshError} Existing data is still shown.`,
                  "Retry refresh",
                  M.RetriedRepositoryLoad(),
                ),
              ]),
          model.tab === "Policies"
            ? policiesView(h, model, model.repository.data)
            : rulesView(h, model, model.repository.data),
        ],
      )
  }
}

const policiesView = (
  h: HtmlBuilder<M.Message>,
  model: Model,
  data: RepositoryData,
): Html =>
  h.div(
    [h.Class("mt-6 overflow-hidden rounded-xl border bg-card shadow-sm")],
    [
      tableHeader(
        h,
        "Policies",
        "Draft programs are published as immutable versions.",
        `${data.policies.length} configured / revision ${data.policyRevision}`,
      ),
      ...(data.policies.length === 0
        ? [
            statusPanel(
              h,
              "No policies yet",
              "Create a pull request policy program.",
            ),
          ]
        : [
            h.div(
              [h.Class("overflow-x-auto")],
              [
                h.table(
                  [h.Class("w-full min-w-200 border-collapse text-left")],
                  [
                    h.thead(
                      [h.Class("bg-muted/35 text-xs text-muted-foreground")],
                      [
                        h.tr(
                          [],
                          [
                            heading(h, "Policy", "min-w-64"),
                            heading(h, "Target", "text-center"),
                            heading(h, "Status", "text-center"),
                            heading(h, "Revision", "text-center"),
                            heading(h, "Usage", "text-center"),
                            heading(h, "", "w-12"),
                          ],
                        ),
                      ],
                    ),
                    h.tbody(
                      [h.Class("divide-y")],
                      data.policies.map((policy) =>
                        policyRow(h, model, data, policy),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ]),
    ],
  )
const policyRow = (
  h: HtmlBuilder<M.Message>,
  model: Model,
  data: RepositoryData,
  policy: Policy,
): Html => {
  const usage = data.rules.filter((rule) => rule.policyId === policy.id).length
  return h.keyed("tr")(
    policy.id,
    [],
    [
      h.td([h.Class("p-4")], [h.span([h.Class("font-medium")], [policy.name])]),
      h.td([h.Class("p-4 text-center font-mono text-xs")], [policy.target]),
      h.td(
        [h.Class("p-4 text-center")],
        [
          statusBadge(
            h,
            policy.publishedVersionId === null ? "Draft" : "Published",
          ),
        ],
      ),
      h.td(
        [h.Class("p-4 text-center font-mono text-sm")],
        [String(policy.version)],
      ),
      h.td([h.Class("p-4 text-center font-mono text-sm")], [String(usage)]),
      h.td([h.Class("w-12 p-2 align-middle")], [policyMenu(h, model, policy)]),
    ],
  )
}

const rulesView = (
  h: HtmlBuilder<M.Message>,
  model: Model,
  data: RepositoryData,
): Html => {
  const fires = new Map(
    data.activity.rules.map((item) => [item.ruleId, item.fires]),
  )
  return h.div(
    [h.Class("mt-6")],
    [
      ...(model.rowMutation._tag === "RowMutationFailed"
        ? [
            errorPanel(
              h,
              model.rowMutation.message,
              model.rowMutation.currentRule === null
                ? "Dismiss"
                : "Retry current version",
              model.rowMutation.currentRule === null
                ? M.DismissedRowMutationError()
                : M.RetriedToggleRule(),
            ),
          ]
        : []),
      ...(publishedPolicies(model).length === 0
        ? [
            errorPanel(
              h,
              "Publish a policy before creating or enabling label rules.",
              "View policies",
              M.SelectedTab({ tab: "Policies" }),
            ),
          ]
        : []),
      h.div(
        [h.Class("overflow-hidden rounded-xl border bg-card shadow-sm")],
        [
          tableHeader(
            h,
            "Label rules",
            "Bind a published policy to a GitHub label.",
            `${data.rules.length} configured / revision ${data.ruleRevision}`,
          ),
          ...(data.rules.length === 0
            ? [
                statusPanel(
                  h,
                  "No label rules yet",
                  "Bind a published policy to a label.",
                ),
              ]
            : [
                h.div(
                  [h.Class("overflow-x-auto")],
                  [
                    h.table(
                      [h.Class("w-full min-w-248 border-collapse text-left")],
                      [
                        h.thead(
                          [
                            h.Class(
                              "bg-muted/35 text-xs text-muted-foreground",
                            ),
                          ],
                          [
                            h.tr(
                              [],
                              [
                                heading(h, "On", "w-20 text-center"),
                                heading(h, "Policy", "min-w-64"),
                                heading(h, "Label", "text-center"),
                                heading(h, "No match", "text-center"),
                                heading(h, "Group / priority", "text-center"),
                                heading(h, "Fires", "text-center"),
                                heading(h, "", "w-12"),
                              ],
                            ),
                          ],
                        ),
                        h.tbody(
                          [h.Class("divide-y")],
                          data.rules.map((rule) =>
                            ruleRow(h, model, rule, fires.get(rule.id) ?? 0),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ]),
        ],
      ),
      h.p(
        [h.Class("mt-3 text-xs text-muted-foreground")],
        [`${data.audit.length} recent audit entries loaded.`],
      ),
    ],
  )
}
const ruleRow = (
  h: HtmlBuilder<M.Message>,
  model: Model,
  rule: Rule,
  fires: number,
): Html =>
  h.keyed("tr")(
    rule.id,
    [h.Class(rule.enabled ? "" : "bg-muted/15 text-muted-foreground")],
    [
      h.td(
        [h.Class("p-2 text-center")],
        [ruleToggle(h, rule, model.rowMutation._tag !== "RowMutationIdle")],
      ),
      h.td(
        [h.Class("p-2")],
        [
          h.span([h.Class("font-medium")], [rule.policy.name]),
          ...(!rule.policy.published
            ? [
                h.p(
                  [h.Class("mt-1 text-xs text-destructive")],
                  ["Unpublished; cannot enable"],
                ),
              ]
            : []),
        ],
      ),
      h.td([h.Class("p-2 text-center")], [labelBadge(h, rule.label)]),
      h.td(
        [h.Class("p-2 text-center text-sm")],
        [rule.onNoMatch === "preserve" ? "Preserve" : "Ensure absent"],
      ),
      h.td(
        [h.Class("p-2 text-center font-mono text-xs")],
        [`${rule.conflictGroup ?? "none"} / ${rule.priority}`],
      ),
      h.td([h.Class("p-2 text-center font-mono text-sm")], [String(fires)]),
      h.td([h.Class("w-12 p-2")], [ruleMenu(h, model, rule)]),
    ],
  )

const ruleToggle = (
  h: HtmlBuilder<M.Message>,
  rule: Rule,
  saving: boolean,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Role("switch"),
      h.AriaChecked(rule.enabled),
      h.AriaLabel(`${rule.enabled ? "Disable" : "Enable"} ${rule.policy.name}`),
      ...(saving || (!rule.enabled && !rule.policy.published)
        ? [h.Disabled(true)]
        : []),
      h.OnClick(M.ToggledRule({ ruleId: rule.id })),
      h.Class(
        `relative h-6 w-11 rounded-full outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${rule.enabled ? "bg-primary" : "bg-muted-foreground/30"}`,
      ),
    ],
    [
      h.span(
        [
          h.Class(
            `absolute top-1 size-4 rounded-full bg-white shadow-sm ${rule.enabled ? "left-6" : "left-1"}`,
          ),
        ],
        [],
      ),
    ],
  )

const policyMenu = (
  h: HtmlBuilder<M.Message>,
  model: Model,
  policy: Policy,
): Html => {
  const menu = model.policyMenus[policy.id]
  return menu === undefined
    ? h.empty
    : h.submodel({
        slotId: menu.id,
        model: menu,
        view: PolicyActionMenu.view,
        toParentMessage: (message) =>
          M.GotPolicyMenuMessage({ policyId: policy.id, message }),
        viewInputs: menuInputs(
          h,
          `Actions for ${policy.name}`,
          PolicyAction.literals,
          "policy",
        ),
      })
}
const ruleMenu = (
  h: HtmlBuilder<M.Message>,
  model: Model,
  rule: Rule,
): Html => {
  const menu = model.ruleMenus[rule.id]
  return menu === undefined
    ? h.empty
    : h.submodel({
        slotId: menu.id,
        model: menu,
        view: RuleActionMenu.view,
        toParentMessage: (message) =>
          M.GotRuleMenuMessage({ ruleId: rule.id, message }),
        viewInputs: menuInputs(
          h,
          `Actions for ${rule.policy.name} / ${rule.label}`,
          RuleAction.literals,
          "label rule",
        ),
      })
}
const menuInputs = <Action extends string>(
  h: HtmlBuilder<M.Message>,
  ariaLabel: string,
  items: ReadonlyArray<Action>,
  noun: string,
) => ({
  items,
  anchor: { placement: "bottom-end" as const, gap: 4, padding: 8 },
  ariaLabel,
  className: "flex justify-center",
  buttonContent: h.span([], [Icon.ellipsis()]),
  buttonClassName:
    "grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground outline-hidden hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
  itemsClassName:
    "z-20 w-40 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg",
  itemToConfig: (action: Action) => ({
    content: h.span(
      [
        h.Class(
          `block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm ${action === "Delete" ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted"}`,
        ),
      ],
      [`${action} ${noun}`],
    ),
  }),
  backdropClassName: "fixed inset-0 z-10",
})

const modals = (
  h: HtmlBuilder<M.Message>,
  model: Model,
): ReadonlyArray<Html> => [
  ...(model.policyEditor._tag === "PolicyEditorClosed"
    ? []
    : [policyEditor(h, model)]),
  ...(model.publishing._tag === "PublishClosed"
    ? []
    : [publishModal(h, model)]),
  ...(model.ruleEditor._tag === "RuleEditorClosed"
    ? []
    : [ruleEditor(h, model)]),
  ...(model.ruleDeletion._tag === "RuleDeleteClosed"
    ? []
    : [deleteRuleModal(h, model)]),
  ...(model.test._tag === "TestClosed" ? [] : [testModal(h, model)]),
]

const policyEditor = (h: HtmlBuilder<M.Message>, model: Model): Html => {
  const editor = model.policyEditor
  if (editor._tag === "PolicyEditorClosed") return h.empty
  if (editor._tag === "PolicyEditorLoading")
    return modalShell(
      h,
      model.policyEditorDialog,
      (message) => M.GotPolicyEditorDialogMessage({ message }),
      "Policy editor",
      [
        modalHeader(
          h,
          model.policyEditorDialog,
          "Loading policy",
          editor.policy.name,
          M.ClosedPolicyEditor(),
        ),
        h.p(
          [h.Class("mt-4 text-sm text-muted-foreground")],
          ["Loading the current draft program..."],
        ),
      ],
    )
  const saving = editor._tag === "PolicyEditorSaving"
  const conflict = editor._tag === "PolicyEditorConflict"
  const existing = editor.identity._tag === "ExistingPolicy"
  return modalShell(
    h,
    model.policyEditorDialog,
    (message) => M.GotPolicyEditorDialogMessage({ message }),
    "Policy editor",
    [
      modalHeader(
        h,
        model.policyEditorDialog,
        existing ? "Edit policy draft" : "Create policy",
        editor.draft.name || "New policy",
        M.ClosedPolicyEditor(),
        saving,
      ),
      ...(editor._tag === "PolicyEditorFailed"
        ? [alert(h, editor.message)]
        : conflict
          ? [conflictAlert(h, editor.message)]
          : []),
      h.div(
        [h.Class("mt-5 grid gap-4 sm:grid-cols-2")],
        [
          field(
            h,
            "policy-name",
            "Policy name",
            h.input([
              h.Id("policy-name"),
              h.Type("text"),
              h.Value(editor.draft.name),
              h.AriaInvalid(editor.draft.name.trim().length === 0),
              h.AriaDescribedBy("policy-name-error"),
              h.OnInput((name) => M.UpdatedPolicyName({ name })),
              h.Class(inputClass),
            ]),
          ),
          field(
            h,
            "policy-target",
            "Target",
            h.select(
              [
                h.Id("policy-target"),
                h.Value("pull_request"),
                h.Disabled(true),
                h.Class(inputClass),
              ],
              [
                h.option([h.Value("pull_request")], ["Pull request"]),
                h.option(
                  [h.Value("issue"), h.Disabled(true)],
                  ["Issue (unsupported)"],
                ),
              ],
            ),
          ),
        ],
      ),
      ...(editor.draft.name.trim().length === 0
        ? [
            h.p(
              [
                h.Id("policy-name-error"),
                h.Class("mt-2 text-sm text-destructive"),
              ],
              ["Policy name is required."],
            ),
          ]
        : []),
      field(
        h,
        "policy-description",
        "Description (optional)",
        h.textarea([
          h.Id("policy-description"),
          h.Value(editor.draft.description),
          h.OnInput((description) =>
            M.UpdatedPolicyDescription({ description }),
          ),
          h.Class(
            "mt-3 min-h-20 w-full rounded-lg border bg-background p-3 text-sm",
          ),
        ]),
        "mt-4",
      ),
      h.section(
        [
          h.AriaLabelledBy("policy-program-title"),
          h.Class("mt-4 rounded-xl border bg-muted/15 p-4"),
        ],
        [
          h.h4(
            [h.Id("policy-program-title"), h.Class("font-semibold")],
            ["Policy program"],
          ),
          h.p(
            [h.Class("mb-3 mt-1 text-xs text-muted-foreground")],
            [
              "Edit the complete pull request policy as JSON. Press Ctrl-Space for context-aware completions.",
            ],
          ),
          h.submodel({
            slotId: "policy-program-editor",
            model: editor.sourceEditor,
            view: PolicyCodeEditor.view,
            toParentMessage: (message) =>
              M.GotPolicyCodeEditorMessage({ message }),
          }),
        ],
      ),
      validationView(h, model),
      h.div(
        [h.Class("mt-6 flex flex-wrap justify-end gap-2 border-t pt-4")],
        [
          h.button(
            [
              h.Type("button"),
              ...(saving ? [h.Disabled(true)] : []),
              h.OnClick(M.ClosedPolicyEditor()),
              h.Class(secondaryButton),
            ],
            ["Cancel"],
          ),
          ...(existing
            ? [
                h.button(
                  [
                    h.Type("button"),
                    ...(editor.dirty ||
                    model.validation._tag === "ValidationRunning"
                      ? [h.Disabled(true)]
                      : []),
                    h.OnClick(M.ValidatedPolicy()),
                    h.Class(secondaryButton),
                  ],
                  [
                    model.validation._tag === "ValidationRunning"
                      ? "Validating..."
                      : "Validate saved draft",
                  ],
                ),
                ...(editor.dirty
                  ? [
                      h.p(
                        [h.Class("self-center text-xs text-muted-foreground")],
                        ["Save local changes before validating."],
                      ),
                    ]
                  : []),
              ]
            : []),
          ...(conflict
            ? [
                h.button(
                  [
                    h.Type("button"),
                    h.OnClick(M.ReloadedPolicyEditor()),
                    h.Class(secondaryButton),
                  ],
                  ["Reload server draft"],
                ),
                h.button(
                  [
                    h.Type("button"),
                    h.OnClick(M.RetriedPolicySave()),
                    h.Class(primaryButton),
                  ],
                  ["Keep draft and retry"],
                ),
              ]
            : []),
          ...(!conflict
            ? [
                h.button(
                  [
                    h.Type("button"),
                    ...(saving ||
                    !validPolicyDraft(editor.draft) ||
                    editor.sourceEditor.program === null
                      ? [h.Disabled(true)]
                      : []),
                    h.OnClick(M.SavedPolicy()),
                    h.Class(primaryButton),
                  ],
                  [
                    saving
                      ? "Saving..."
                      : existing
                        ? "Save draft"
                        : "Create policy",
                  ],
                ),
              ]
            : []),
        ],
      ),
    ],
  )
}

const validationView = (h: HtmlBuilder<M.Message>, model: Model): Html => {
  switch (model.validation._tag) {
    case "ValidationIdle":
    case "ValidationRunning":
      return h.empty
    case "ValidationFailed":
      return alert(h, model.validation.message)
    case "ValidationResult":
      return h.div(
        [
          h.Role("status"),
          h.AriaLive("polite"),
          h.Class(
            "mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm",
          ),
        ],
        [
          h.p([h.Class("font-medium text-success")], ["Draft is valid"]),
          h.p(
            [h.Class("mt-1")],
            [
              `${model.validation.result.nodeCount} nodes / facts: ${model.validation.result.facts.join(", ") || "none"} / triggers: ${model.validation.result.triggers.join(", ") || "none"}`,
            ],
          ),
        ],
      )
  }
}

const publishModal = (h: HtmlBuilder<M.Message>, model: Model): Html => {
  const publishing = model.publishing
  if (publishing._tag === "PublishClosed") return h.empty
  const title =
    publishing._tag === "PublishResult"
      ? publishing.result.policy.name
      : publishing.policy.name
  return modalShell(
    h,
    model.publishDialog,
    (message) => M.GotPublishDialogMessage({ message }),
    "Publish policy",
    [
      modalHeader(
        h,
        model.publishDialog,
        "Publish policy",
        title,
        M.DismissedPublishPolicy(),
        publishing._tag === "Publishing",
      ),
      ...(publishing._tag === "PublishFailed"
        ? [alert(h, publishing.message)]
        : []),
      ...(publishing._tag === "PublishResult"
        ? [
            h.div(
              [
                h.Class(
                  "mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm",
                ),
              ],
              [
                h.p(
                  [h.Class("font-medium text-success")],
                  [
                    `Published revision ${publishing.result.published.revision}`,
                  ],
                ),
                h.p(
                  [h.Class("mt-2")],
                  [
                    `Facts: ${publishing.result.impact.facts.join(", ") || "none"}`,
                  ],
                ),
                h.p(
                  [],
                  [
                    `Triggers: ${publishing.result.impact.triggers.join(", ") || "none"}`,
                  ],
                ),
              ],
            ),
          ]
        : [
            h.p(
              [h.Class("mt-4 text-sm text-muted-foreground")],
              [
                "Validate and publish the current draft as an immutable version. The impact response will list facts and triggers.",
              ],
            ),
          ]),
      h.div(
        [h.Class("mt-6 flex justify-end gap-2")],
        [
          h.button(
            [
              h.Type("button"),
              ...(publishing._tag === "Publishing" ? [h.Disabled(true)] : []),
              h.OnClick(M.DismissedPublishPolicy()),
              h.Class(secondaryButton),
            ],
            [publishing._tag === "PublishResult" ? "Done" : "Cancel"],
          ),
          ...(publishing._tag === "PublishResult"
            ? []
            : [
                h.button(
                  [
                    h.Type("button"),
                    ...(publishing._tag === "Publishing"
                      ? [h.Disabled(true)]
                      : []),
                    h.OnClick(M.ConfirmedPublishPolicy()),
                    h.Class(primaryButton),
                  ],
                  [
                    publishing._tag === "Publishing"
                      ? "Publishing..."
                      : "Publish draft",
                  ],
                ),
              ]),
        ],
      ),
    ],
  )
}

const ruleEditor = (h: HtmlBuilder<M.Message>, model: Model): Html => {
  const editor = model.ruleEditor
  if (editor._tag === "RuleEditorClosed") return h.empty
  const loaded =
    model.repository._tag === "LoadedRepository" ? model.repository.data : null
  const published = publishedPolicies(model)
  const selected =
    loaded?.policies.find((policy) => policy.id === editor.draft.policyId) ??
    null
  const unavailable = selected === null || selected.publishedVersionId === null
  const saving = editor._tag === "RuleEditorSaving"
  const conflict = editor._tag === "RuleEditorConflict"
  return modalShell(
    h,
    model.ruleEditorDialog,
    (message) => M.GotRuleEditorDialogMessage({ message }),
    "Label rule editor",
    [
      modalHeader(
        h,
        model.ruleEditorDialog,
        editor.identity._tag === "NewRule"
          ? "Create label rule"
          : "Edit label rule",
        "Published policy binding",
        M.ClosedRuleEditor(),
        saving,
      ),
      ...(editor._tag === "RuleEditorFailed"
        ? [alert(h, editor.message)]
        : conflict
          ? [conflictAlert(h, editor.message)]
          : []),
      ...(unavailable
        ? [
            alert(
              h,
              "This policy is unpublished. Select a published policy before saving or enabling the rule.",
            ),
          ]
        : []),
      h.div(
        [h.Class("mt-5 grid gap-4 sm:grid-cols-2")],
        [
          field(
            h,
            "rule-policy",
            "Published policy",
            h.select(
              [
                h.Id("rule-policy"),
                h.Value(editor.draft.policyId),
                h.OnInput((value) => {
                  const item = published.find((policy) => policy.id === value)
                  return item === undefined
                    ? M.IgnoredInput()
                    : M.UpdatedRulePolicy({ policyId: item.id })
                }),
                h.Class(inputClass),
              ],
              published.map((policy) =>
                h.option([h.Value(policy.id)], [policy.name]),
              ),
            ),
          ),
          field(
            h,
            "rule-label",
            "GitHub label",
            h.select(
              [
                h.Id("rule-label"),
                h.Value(editor.draft.label),
                h.AriaInvalid(editor.draft.label.length === 0),
                h.AriaDescribedBy("rule-label-error"),
                h.OnInput((label) => M.UpdatedRuleLabel({ label })),
                h.Class(inputClass),
              ],
              (loaded?.labels ?? []).map((label) =>
                h.option([h.Value(label.name)], [label.name]),
              ),
            ),
          ),
          field(
            h,
            "rule-no-match",
            "On no match",
            h.select(
              [
                h.Id("rule-no-match"),
                h.Value(editor.draft.onNoMatch),
                h.OnInput((value) =>
                  M.UpdatedRuleNoMatch({
                    onNoMatch:
                      value === "ensure-absent" ? "ensure-absent" : "preserve",
                  }),
                ),
                h.Class(inputClass),
              ],
              [
                h.option([h.Value("preserve")], ["Preserve current label"]),
                h.option([h.Value("ensure-absent")], ["Ensure label absent"]),
              ],
            ),
          ),
          field(
            h,
            "rule-group",
            "Conflict group (optional)",
            h.input([
              h.Id("rule-group"),
              h.Type("text"),
              h.Value(editor.draft.conflictGroup),
              h.OnInput((conflictGroup) =>
                M.UpdatedRuleConflictGroup({ conflictGroup }),
              ),
              h.Class(inputClass),
            ]),
          ),
          field(
            h,
            "rule-priority",
            "Priority",
            h.input([
              h.Id("rule-priority"),
              h.Type("number"),
              h.Value(String(editor.draft.priority)),
              h.OnInput((value) =>
                M.UpdatedRulePriority({ priority: Number(value) }),
              ),
              h.Class(inputClass),
            ]),
          ),
        ],
      ),
      ...(editor.draft.label.length === 0
        ? [
            h.p(
              [
                h.Id("rule-label-error"),
                h.Class("mt-2 text-sm text-destructive"),
              ],
              ["GitHub label is required."],
            ),
          ]
        : []),
      h.div(
        [h.Class("mt-6 flex justify-end gap-2 border-t pt-4")],
        [
          h.button(
            [
              h.Type("button"),
              ...(saving ? [h.Disabled(true)] : []),
              h.OnClick(M.ClosedRuleEditor()),
              h.Class(secondaryButton),
            ],
            ["Cancel"],
          ),
          ...(conflict
            ? [
                h.button(
                  [
                    h.Type("button"),
                    h.OnClick(M.ReloadedRuleEditor()),
                    h.Class(secondaryButton),
                  ],
                  ["Reload server values"],
                ),
                h.button(
                  [
                    h.Type("button"),
                    h.OnClick(M.RetriedRuleSave()),
                    h.Class(primaryButton),
                  ],
                  ["Keep draft and retry"],
                ),
              ]
            : [
                h.button(
                  [
                    h.Type("button"),
                    ...(saving || unavailable || editor.draft.label.length === 0
                      ? [h.Disabled(true)]
                      : []),
                    h.OnClick(M.SavedRule()),
                    h.Class(primaryButton),
                  ],
                  [saving ? "Saving..." : "Save label rule"],
                ),
              ]),
        ],
      ),
    ],
  )
}

const deleteRuleModal = (h: HtmlBuilder<M.Message>, model: Model): Html => {
  const deletion = model.ruleDeletion
  if (deletion._tag === "RuleDeleteClosed") return h.empty
  const deleting = deletion._tag === "RuleDeleting"
  return modalShell(
    h,
    model.ruleDeleteDialog,
    (message) => M.GotRuleDeleteDialogMessage({ message }),
    "Delete label rule",
    [
      modalHeader(
        h,
        model.ruleDeleteDialog,
        "Delete label rule",
        `${deletion.rule.policy.name} / ${deletion.rule.label}`,
        M.DismissedDeleteRule(),
        deleting,
      ),
      ...(deletion._tag === "RuleDeleteFailed"
        ? [alert(h, deletion.message)]
        : []),
      h.p(
        [h.Class("mt-4 text-sm text-muted-foreground")],
        [
          deletion.rule.enabled
            ? "Disable this rule before deleting it."
            : "This removes only the binding; policy versions remain intact.",
        ],
      ),
      h.div(
        [h.Class("mt-6 flex justify-end gap-2")],
        [
          h.button(
            [
              h.Type("button"),
              ...(deleting ? [h.Disabled(true)] : []),
              h.OnClick(M.DismissedDeleteRule()),
              h.Class(secondaryButton),
            ],
            ["Cancel"],
          ),
          h.button(
            [
              h.Type("button"),
              ...(deletion.rule.enabled || deleting ? [h.Disabled(true)] : []),
              h.OnClick(M.ConfirmedDeleteRule()),
              h.Class(destructiveButton),
            ],
            [
              deleting
                ? "Deleting..."
                : deletion.rule.enabled
                  ? "Disable before deleting"
                  : "Delete rule",
            ],
          ),
        ],
      ),
    ],
  )
}

const testModal = (h: HtmlBuilder<M.Message>, model: Model): Html => {
  const test = model.test
  if (test._tag === "TestClosed") return h.empty
  return modalShell(
    h,
    model.testDialog,
    (message) => M.GotTestDialogMessage({ message }),
    "No-write policy test",
    [
      modalHeader(
        h,
        model.testDialog,
        "Draft test",
        `Test ${test.policy.name}`,
        M.DismissedPolicyTest(),
        test._tag === "TestRunning",
      ),
      h.p(
        [h.Class("mt-2 text-sm text-muted-foreground")],
        ["Tests the saved policy draft. No labels are written."],
      ),
      ...(test._tag === "TestLoadingCandidates"
        ? [h.p([h.Class("mt-4 text-sm")], ["Loading pull requests..."])]
        : test._tag === "TestResult"
          ? [testResult(h, test.result)]
          : [
              ...(test._tag === "TestFailed"
                ? [alert(h, `Error: ${test.message}`)]
                : []),
              ...(test.candidates.length === 0
                ? [h.p([h.Class("mt-4 text-sm")], ["No candidates available."])]
                : [
                    h.div(
                      [h.Class("mt-4 grid gap-3 sm:grid-cols-[1fr_auto]")],
                      [
                        field(
                          h,
                          "test-pr",
                          "Pull request",
                          h.select(
                            [
                              h.Id("test-pr"),
                              h.Value(String(test.selectedPullRequest ?? "")),
                              h.OnInput((value) =>
                                M.SelectedPolicyTestCandidate({
                                  pullRequestNumber: Number(value),
                                }),
                              ),
                              h.Class(inputClass),
                            ],
                            test.candidates.map((candidate) =>
                              h.option(
                                [h.Value(String(candidate.number))],
                                [`#${candidate.number} ${candidate.title}`],
                              ),
                            ),
                          ),
                        ),
                        h.button(
                          [
                            h.Type("button"),
                            ...(test._tag === "TestRunning"
                              ? [h.Disabled(true)]
                              : []),
                            h.OnClick(M.RanPolicyTest()),
                            h.Class(`self-end ${primaryButton}`),
                          ],
                          [
                            test._tag === "TestRunning"
                              ? "Running..."
                              : "Run test",
                          ],
                        ),
                      ],
                    ),
                  ]),
            ]),
    ],
  )
}
const testResult = (
  h: HtmlBuilder<M.Message>,
  result: typeof PolicyManagement.TestPolicyResponse.Type,
): Html =>
  h.div(
    [h.Role("status"), h.AriaLive("polite"), h.Class("mt-5")],
    [
      h.div(
        [h.Class("rounded-xl border p-4")],
        [
          h.div(
            [h.Class("flex items-center justify-between")],
            [
              h.h4([h.Class("font-semibold")], [result.decision.outcome]),
              h.span(
                [h.Class("font-mono text-xs")],
                [`${Math.round(result.decision.confidence * 100)}% confidence`],
              ),
            ],
          ),
          h.p(
            [h.Class("mt-2 text-sm text-muted-foreground")],
            [result.decision.rationale],
          ),
          h.h5(
            [h.Class("mt-4 text-xs font-semibold uppercase")],
            ["Node trace"],
          ),
          h.div(
            [h.Class("mt-2 space-y-1")],
            result.decision.trace.map((trace) =>
              h.keyed("p")(
                PolicyProgram.policyNodeLocationKey(trace.location),
                [h.Class("text-xs")],
                [
                  `${PolicyProgram.formatPolicyNodeLocation(trace.location)}: ${trace.outcome} / ${trace.rationale}`,
                ],
              ),
            ),
          ),
          h.p(
            [h.Class("mt-3 text-xs text-muted-foreground")],
            [
              result.tested._tag === "Draft"
                ? `Tested draft version ${result.tested.version}`
                : `Tested published version ${result.tested.policyVersionId}`,
            ],
          ),
        ],
      ),
      h.div(
        [h.Class("mt-4 flex justify-end")],
        [
          h.button(
            [
              h.Type("button"),
              h.OnClick(M.ResetPolicyTest()),
              h.Class(secondaryButton),
            ],
            ["Test another pull request"],
          ),
        ],
      ),
    ],
  )

const modalShell = (
  h: HtmlBuilder<M.Message>,
  dialogModel: Dialog.Model,
  toParentMessage: (message: Dialog.Message) => M.Message,
  descriptionText: string,
  content: ReadonlyArray<Html>,
): Html =>
  h.submodel({
    slotId: dialogModel.id,
    model: dialogModel,
    view: Dialog.view,
    toParentMessage,
    viewInputs: {
      toView: ({
        dialog,
        backdrop,
        description,
        initialFocus,
        isVisible,
        panel,
      }) =>
        h.dialog(
          [
            ...dialog,
            h.Class(
              "fixed inset-0 z-50 m-0 size-full max-h-none max-w-none border-0 bg-transparent p-4",
            ),
          ],
          isVisible
            ? [
                h.div([...backdrop, h.Class("fixed inset-0 bg-black/65")]),
                h.div(
                  [
                    ...panel,
                    ...initialFocus,
                    h.Tabindex(-1),
                    h.Class(
                      "relative z-10 mx-auto max-h-[calc(100svh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl",
                    ),
                  ],
                  [
                    h.p(
                      [...description, h.Class("sr-only")],
                      [descriptionText],
                    ),
                    ...content,
                  ],
                ),
              ]
            : [],
        ),
    },
  })
const modalHeader = (
  h: HtmlBuilder<M.Message>,
  dialog: Dialog.Model,
  eyebrow: string,
  title: string,
  close: M.Message,
  disabled = false,
): Html =>
  h.div(
    [h.Class("flex items-start justify-between gap-4")],
    [
      h.div(
        [],
        [
          h.p(
            [
              h.Class(
                "font-mono text-[10px] font-semibold uppercase tracking-widest text-primary",
              ),
            ],
            [eyebrow],
          ),
          h.h3(
            [
              h.Id(Dialog.titleId(dialog)),
              h.Class("mt-2 text-xl font-semibold"),
            ],
            [title],
          ),
        ],
      ),
      h.button(
        [
          h.Type("button"),
          h.AriaLabel("Close dialog"),
          ...(disabled ? [h.Disabled(true)] : []),
          h.OnClick(close),
          h.Class(
            "grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted",
          ),
        ],
        ["x"],
      ),
    ],
  )
const conflictAlert = (h: HtmlBuilder<M.Message>, message: string): Html =>
  alert(
    h,
    `${message} Reload server values or keep this local draft and retry against the current version.`,
  )
const alert = (h: HtmlBuilder<M.Message>, message: string): Html =>
  h.div(
    [
      h.Role("alert"),
      h.Class(
        "mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive",
      ),
    ],
    [message],
  )
const errorPanel = (
  h: HtmlBuilder<M.Message>,
  message: string,
  action: string,
  onClick: M.Message,
): Html =>
  h.div(
    [
      h.Role("alert"),
      h.Class(
        "mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4",
      ),
    ],
    [
      h.p([h.Class("text-sm")], [message]),
      h.button(
        [
          h.Type("button"),
          h.OnClick(onClick),
          h.Class(`mt-3 ${secondaryButton}`),
        ],
        [action],
      ),
    ],
  )
const statusPanel = (
  h: HtmlBuilder<M.Message>,
  title: string,
  description: string,
): Html =>
  h.div(
    [h.Class("mt-6 rounded-xl border bg-card p-6 text-center")],
    [
      h.h3([h.Class("font-semibold")], [title]),
      h.p([h.Class("mt-2 text-sm text-muted-foreground")], [description]),
    ],
  )
const tableHeader = (
  h: HtmlBuilder<M.Message>,
  title: string,
  description: string,
  count: string,
): Html =>
  h.div(
    [h.Class("flex items-center justify-between border-b px-4 py-4")],
    [
      h.div(
        [],
        [
          h.h3([h.Class("font-semibold")], [title]),
          h.p([h.Class("mt-1 text-sm text-muted-foreground")], [description]),
        ],
      ),
      h.span(
        [
          h.Class(
            "rounded-md border bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
          ),
        ],
        [count],
      ),
    ],
  )
const heading = (
  h: HtmlBuilder<M.Message>,
  label: string,
  className = "",
): Html => h.th([h.Class(`px-4 py-3 font-medium ${className}`)], [label])
const field = (
  h: HtmlBuilder<M.Message>,
  id: string,
  label: string,
  control: Html,
  className = "",
): Html =>
  h.div(
    [h.Class(className)],
    [
      h.label(
        [
          h.For(id),
          h.Class(
            "mb-2 block font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
          ),
        ],
        [label],
      ),
      control,
    ],
  )
const statusBadge = (h: HtmlBuilder<M.Message>, label: string): Html =>
  h.span(
    [
      h.Class(
        "rounded-full border bg-muted px-2 py-1 font-mono text-[10px] font-semibold uppercase",
      ),
    ],
    [label],
  )
const labelBadge = (h: HtmlBuilder<M.Message>, label: string): Html =>
  h.span(
    [
      h.Class(
        "inline-flex rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-medium text-primary",
      ),
    ],
    [label],
  )
const publishedPolicies = (model: Model): ReadonlyArray<Policy> =>
  model.repository._tag === "LoadedRepository"
    ? model.repository.data.policies.filter(
        (policy) => policy.publishedVersionId !== null,
      )
    : []
