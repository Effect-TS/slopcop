import type * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import type * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import type { Html, HtmlBuilder } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import * as Icon from "../icon"
import {
  ClosedRuleEditor,
  ConfirmedDeleteRule,
  DismissedDeleteRule,
  DismissedRuleTest,
  OpenedDeleteRule,
  OpenedNewRule,
  OpenedRuleEditor,
  OpenedRuleTest,
  RanRuleTest,
  ResetRuleTest,
  RetriedRepositoryLoad,
  SavedRule,
  SelectedRuleTestCandidate,
  ToggledRule,
  ToggledRuleMenu,
  UpdatedRuleConfidence,
  UpdatedRuleExclusiveGroup,
  UpdatedRuleKind,
  UpdatedRuleLabel,
  UpdatedRuleMode,
  UpdatedRuleName,
  UpdatedRulePrompt,
  type Message,
} from "./message"
import type {
  Model,
  RepositoryData,
  RuleDraft,
  RuleKind,
  RuleMode,
} from "./model"

type Rule = typeof LabelingRuleManagement.PublicLabelingRule.Type
type Label = typeof GitHubLabel.GitHubLabel.Type

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm outline-hidden hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
const secondaryButton =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
const inputClass =
  "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20"

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.section(
    [
      h.AriaLabelledBy("auto-labeling-title"),
      h.Class("w-full self-stretch px-4 py-6 sm:px-6 lg:px-8"),
    ],
    [pageHeader(h, model), repositoryView(h, model), ...modalViews(h, model)],
  ),
)

const pageHeader = (h: HtmlBuilder<Message>, model: Model): Html =>
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
            ["Auto-labeling rules"],
          ),
          h.p(
            [h.Class("mt-2 max-w-2xl text-sm leading-6 text-muted-foreground")],
            [
              "Describe intent in plain language. SlopCop evaluates each prompt against new pull requests and applies the matching GitHub label.",
            ],
          ),
        ],
      ),
      h.button(
        [
          h.Type("button"),
          ...(model.repository._tag === "LoadedRepository"
            ? []
            : [h.Disabled(true)]),
          h.OnClick(OpenedNewRule()),
          h.Class(primaryButton),
        ],
        [Icon.plus(), "New rule"],
      ),
    ],
  )

const repositoryName = (model: Model): string => {
  switch (model.repository._tag) {
    case "NoRepository":
      return "Select a repository"
    case "LoadingRepository":
    case "FailedRepository":
      return `${model.repository.repository.owner}/${model.repository.repository.repo}`
    case "LoadedRepository":
      return `${model.repository.data.repository.owner}/${model.repository.data.repository.repo}`
  }
}

const repositoryView = (h: HtmlBuilder<Message>, model: Model): Html => {
  switch (model.repository._tag) {
    case "NoRepository":
      return statusPanel(
        h,
        "No repository selected",
        "Choose a repository from the sidebar to manage its rules.",
      )
    case "LoadingRepository":
      return statusPanel(
        h,
        "Loading rules",
        "Loading rules, 30-day activity, and GitHub labels...",
      )
    case "FailedRepository":
      return h.div(
        [
          h.Class(
            "mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5",
          ),
        ],
        [
          h.h3([h.Class("font-semibold")], ["Rules could not be loaded"]),
          h.p(
            [h.Class("mt-2 text-sm text-muted-foreground")],
            [model.repository.message],
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(RetriedRepositoryLoad()),
              h.Class(`mt-4 ${secondaryButton}`),
            ],
            ["Retry"],
          ),
        ],
      )
    case "LoadedRepository":
      return tableView(h, model, model.repository.data)
  }
}

const statusPanel = (
  h: HtmlBuilder<Message>,
  title: string,
  description: string,
): Html =>
  h.div(
    [h.Class("mt-6 rounded-xl border bg-card p-6 text-center shadow-sm")],
    [
      h.h3([h.Class("font-semibold")], [title]),
      h.p([h.Class("mt-2 text-sm text-muted-foreground")], [description]),
    ],
  )

const tableView = (
  h: HtmlBuilder<Message>,
  model: Model,
  data: RepositoryData,
): Html => {
  const live = data.rules.filter((rule) => rule.enabled).length
  const paused = data.rules.length - live
  const fires = new Map(
    data.activity.rules.map((item) => [item.ruleId, item.fires]),
  )
  return h.div(
    [h.Class("mt-6")],
    [
      h.div(
        [h.Class("grid gap-3 sm:grid-cols-3")],
        [
          metricCard(h, "Live rules", String(live), "Writing labels to GitHub"),
          metricCard(
            h,
            "Paused rules",
            String(paused),
            "Kept in the rule book",
          ),
          metricCard(
            h,
            "Total fires",
            String(data.activity.totalFires),
            `Across the last ${data.activity.windowDays} days`,
          ),
        ],
      ),
      ...(model.rowMutation._tag === "RowMutationFailed"
        ? [errorBanner(h, model.rowMutation.message)]
        : []),
      h.div(
        [h.Class("mt-4 overflow-hidden rounded-xl border bg-card shadow-sm")],
        [
          h.div(
            [
              h.Class(
                "flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
              ),
            ],
            [
              h.div(
                [],
                [
                  h.h3([h.Class("font-semibold")], ["Rule book"]),
                  h.p(
                    [h.Class("mt-1 text-sm text-muted-foreground")],
                    [
                      "Rules are evaluated independently for each new pull request.",
                    ],
                  ),
                ],
              ),
              h.span(
                [
                  h.Class(
                    "w-fit rounded-md border bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
                  ),
                ],
                [`${data.rules.length} configured / revision ${data.revision}`],
              ),
            ],
          ),
          ...(data.rules.length === 0
            ? [
                statusPanel(
                  h,
                  "No rules yet",
                  "Create a rule to begin labeling pull requests.",
                ),
              ]
            : [
                h.div(
                  [h.Class("overflow-x-auto")],
                  [
                    h.table(
                      [
                        h.Class(
                          "w-full min-w-[62rem] border-collapse text-left",
                        ),
                      ],
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
                                tableHeading(h, "On", "w-20"),
                                tableHeading(h, "Rule", "min-w-80"),
                                tableHeading(h, "Applies"),
                                tableHeading(h, "Confidence", "text-right"),
                                tableHeading(h, "Fires", "text-right"),
                                tableHeading(h, "Mode"),
                                tableHeading(h, "", "w-24"),
                              ],
                            ),
                          ],
                        ),
                        h.tbody(
                          [h.Class("divide-y")],
                          data.rules.map((rule, index) =>
                            tableRow(
                              h,
                              model,
                              rule,
                              index,
                              fires.get(rule.id) ?? 0,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ]),
        ],
      ),
    ],
  )
}

const metricCard = (
  h: HtmlBuilder<Message>,
  label: string,
  value: string,
  description: string,
): Html =>
  h.div(
    [h.Class("rounded-xl border bg-card p-4 shadow-sm")],
    [
      h.p(
        [
          h.Class(
            "font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
          ),
        ],
        [label],
      ),
      h.p([h.Class("mt-2 text-2xl font-semibold tabular-nums")], [value]),
      h.p([h.Class("mt-1 text-xs text-muted-foreground")], [description]),
    ],
  )

const tableHeading = (
  h: HtmlBuilder<Message>,
  label: string,
  className = "",
): Html => h.th([h.Class(`px-4 py-3 font-medium ${className}`)], [label])

const tableRow = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
  index: number,
  fires: number,
): Html => {
  const saving =
    model.rowMutation._tag === "RowMutationSaving" &&
    model.rowMutation.ruleId === rule.id
  return h.tr(
    [h.Class(rule.enabled ? "" : "bg-muted/15 text-muted-foreground")],
    [
      h.td([h.Class("px-4 py-4 align-top")], [ruleToggle(h, rule, saving)]),
      h.td(
        [h.Class("px-4 py-4")],
        [
          h.div(
            [h.Class("flex items-baseline gap-2")],
            [
              h.span(
                [h.Class("font-mono text-[10px] text-muted-foreground")],
                [String(index + 1).padStart(2, "0")],
              ),
              h.span([h.Class("font-medium text-foreground")], [rule.name]),
            ],
          ),
          h.p(
            [
              h.Class(
                "mt-2 max-w-xl overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-muted-foreground",
              ),
            ],
            [rule.instructions],
          ),
        ],
      ),
      h.td([h.Class("px-4 py-4 align-top")], [labelBadge(h, rule.label)]),
      h.td(
        [
          h.Class(
            "px-4 py-4 text-right align-top font-mono text-sm tabular-nums",
          ),
        ],
        [`${Math.round(rule.confidenceThreshold * 100)}%`],
      ),
      h.td(
        [
          h.Class(
            "px-4 py-4 text-right align-top font-mono text-sm tabular-nums",
          ),
        ],
        [String(fires)],
      ),
      h.td(
        [h.Class("px-4 py-4 align-top")],
        [
          h.span(
            [
              h.Class(
                rule.enabled
                  ? "rounded-full border border-success/25 bg-success/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-success"
                  : "rounded-full border bg-muted px-2 py-1 font-mono text-[10px] font-semibold uppercase text-muted-foreground",
              ),
            ],
            [rule.enabled ? "Live" : "Paused"],
          ),
        ],
      ),
      h.td(
        [h.Class("px-4 py-4 text-right align-top")],
        [ruleActionsMenu(h, model, rule)],
      ),
    ],
  )
}

const ruleToggle = (
  h: HtmlBuilder<Message>,
  rule: Rule,
  saving: boolean,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Role("switch"),
      h.AriaChecked(rule.enabled),
      h.AriaLabel(`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`),
      ...(saving ? [h.Disabled(true)] : []),
      h.OnClick(ToggledRule({ ruleId: rule.id })),
      h.Class(
        `relative h-6 w-11 rounded-full outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 ${rule.enabled ? "bg-primary" : "bg-muted-foreground/30"}`,
      ),
    ],
    [
      h.span(
        [
          h.Class(
            `absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${rule.enabled ? "left-6" : "left-1"}`,
          ),
        ],
        [],
      ),
    ],
  )

const ruleActionsMenu = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html => {
  const open = model.openRuleMenu === rule.id
  return h.div(
    [h.Class("relative inline-block text-left")],
    [
      h.button(
        [
          h.Type("button"),
          h.AriaLabel(`Actions for ${rule.name}`),
          h.AriaExpanded(open),
          h.OnClick(ToggledRuleMenu({ ruleId: rule.id })),
          h.Class(
            "grid size-8 place-items-center rounded-md font-mono text-base tracking-widest text-muted-foreground outline-hidden hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          ),
        ],
        ["..."],
      ),
      ...(open
        ? [
            h.div(
              [
                h.Role("menu"),
                h.Class(
                  "absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-left text-popover-foreground shadow-lg",
                ),
              ],
              [
                menuButton(
                  h,
                  "Edit rule",
                  OpenedRuleEditor({ ruleId: rule.id }),
                ),
                menuButton(h, "Test rule", OpenedRuleTest({ ruleId: rule.id })),
                h.div([h.Class("my-1 border-t")], []),
                menuButton(
                  h,
                  "Delete rule",
                  OpenedDeleteRule({ ruleId: rule.id }),
                  true,
                ),
              ],
            ),
          ]
        : []),
    ],
  )
}

const menuButton = (
  h: HtmlBuilder<Message>,
  label: string,
  message: Message,
  destructive = false,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Role("menuitem"),
      h.OnClick(message),
      h.Class(
        `w-full rounded-md px-3 py-2 text-left text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 ${destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted"}`,
      ),
    ],
    [label],
  )

const modalViews = (
  h: HtmlBuilder<Message>,
  model: Model,
): ReadonlyArray<Html> => [
  ...(model.editor._tag === "EditorClosed" ? [] : [editorModal(h, model)]),
  ...(model.deletion._tag === "DeleteClosed" ? [] : [deleteModal(h, model)]),
  ...(model.test._tag === "TestClosed" ? [] : [testModal(h, model)]),
]

const modalShell = (
  h: HtmlBuilder<Message>,
  labelId: string,
  closeLabel: string,
  closeMessage: Message,
  content: ReadonlyArray<Html>,
  alert = false,
): Html =>
  h.div(
    [
      h.Role(alert ? "alertdialog" : "dialog"),
      h.AriaModal(true),
      h.AriaLabelledBy(labelId),
      h.Class("fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.AriaLabel(closeLabel),
          h.OnClick(closeMessage),
          h.Class("absolute inset-0 bg-black/65 backdrop-blur-[2px]"),
        ],
        [],
      ),
      h.div(
        [
          h.Class(
            "relative z-10 max-h-[calc(100svh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl sm:max-h-[calc(100svh-3rem)] sm:p-6",
          ),
        ],
        content,
      ),
    ],
  )

const editorModal = (h: HtmlBuilder<Message>, model: Model): Html => {
  if (model.editor._tag === "EditorClosed") return h.div([], [])
  const draft = model.editor.draft
  const saving = model.editor._tag === "EditorSaving"
  const labels =
    model.repository._tag === "LoadedRepository"
      ? model.repository.data.labels
      : []
  const isNew = model.editor.ruleId === null
  return modalShell(
    h,
    "rule-editor-title",
    "Close rule editor",
    ClosedRuleEditor(),
    [
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
                [isNew ? "Create rule" : "Edit rule"],
              ),
              h.h3(
                [
                  h.Id("rule-editor-title"),
                  h.Class("mt-2 text-xl font-semibold"),
                ],
                [isNew ? "New auto-labeling rule" : draft.name],
              ),
              h.div([h.Class("mt-3")], [labelBadge(h, draft.label)]),
            ],
          ),
          h.button(
            [
              h.Type("button"),
              h.AriaLabel("Close rule editor"),
              h.OnClick(ClosedRuleEditor()),
              h.Class(
                "grid size-9 place-items-center rounded-lg text-lg text-muted-foreground hover:bg-muted hover:text-foreground",
              ),
            ],
            ["x"],
          ),
        ],
      ),
      ...(model.editor._tag === "EditorFailed"
        ? [
            errorBanner(h, model.editor.message),
            ...(model.editor.currentRule === null
              ? []
              : [
                  h.p(
                    [h.Class("mt-2 text-xs text-muted-foreground")],
                    [
                      `Server version ${model.editor.currentRule.version}: ${model.editor.currentRule.name} uses ${model.editor.currentRule.label}.`,
                    ],
                  ),
                ]),
          ]
        : []),
      h.p(
        [h.Class("mt-5 text-sm leading-6 text-muted-foreground")],
        [
          "Describe when this label should be applied. Include exclusions when nearby changes should not match.",
        ],
      ),
      h.div(
        [
          h.Class(
            "mt-5 grid gap-5 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2",
          ),
        ],
        [
          field(
            h,
            "rule-name",
            "Rule name",
            h.input([
              h.Id("rule-name"),
              h.Type("text"),
              h.Value(draft.name),
              h.OnInput((name) => UpdatedRuleName({ name })),
              h.Class(inputClass),
            ]),
          ),
          field(h, "rule-label", "GitHub label", labelSelect(h, draft, labels)),
          confidenceField(h, draft),
        ],
      ),
      field(
        h,
        "rule-prompt",
        "Rule prompt",
        h.textarea([
          h.Id("rule-prompt"),
          h.Value(draft.instructions),
          h.OnInput((instructions) => UpdatedRulePrompt({ instructions })),
          h.Class(
            "min-h-40 w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 shadow-xs outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20",
          ),
        ]),
        "mt-4",
      ),
      h.p(
        [
          h.Class(
            "mt-1 text-right font-mono text-[10px] text-muted-foreground",
          ),
        ],
        [`${draft.instructions.length} / 4,000 characters`],
      ),
      advancedFields(h, draft),
      h.div(
        [
          h.Class(
            "mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end",
          ),
        ],
        [
          h.button(
            [
              h.Type("button"),
              h.OnClick(ClosedRuleEditor()),
              h.Class(secondaryButton),
            ],
            ["Cancel"],
          ),
          h.button(
            [
              h.Type("button"),
              ...(saving || !validDraft(draft) ? [h.Disabled(true)] : []),
              h.OnClick(SavedRule()),
              h.Class(primaryButton),
            ],
            [saving ? "Saving..." : isNew ? "Create rule" : "Save changes"],
          ),
        ],
      ),
    ],
  )
}

const validDraft = (draft: RuleDraft): boolean =>
  draft.name.trim().length > 0 &&
  draft.name.length <= 100 &&
  draft.label.length > 0 &&
  draft.instructions.trim().length > 0 &&
  draft.instructions.length <= 4_000 &&
  draft.exclusiveGroup.length <= 100

const field = (
  h: HtmlBuilder<Message>,
  id: string,
  label: string,
  control: Html,
  className = "",
): Html => h.div([h.Class(className)], [modalLabel(h, id, label), control])

const labelSelect = (
  h: HtmlBuilder<Message>,
  draft: RuleDraft,
  labels: ReadonlyArray<Label>,
): Html =>
  h.select(
    [
      h.Id("rule-label"),
      h.Value(draft.label),
      h.OnInput((label) => UpdatedRuleLabel({ label })),
      h.Class(inputClass),
    ],
    labels.map((label) => h.option([h.Value(label.name)], [label.name])),
  )

const confidenceField = (h: HtmlBuilder<Message>, draft: RuleDraft): Html => {
  const percentage = Math.round(draft.confidenceThreshold * 100)
  return h.div(
    [h.Class("sm:col-span-2")],
    [
      h.div(
        [h.Class("mb-2 flex items-center justify-between gap-3")],
        [
          modalLabel(h, "rule-confidence", "Confidence threshold"),
          h.output(
            [
              h.For("rule-confidence"),
              h.Class(
                "font-mono text-sm font-semibold tabular-nums text-primary",
              ),
            ],
            [`${percentage}%`],
          ),
        ],
      ),
      h.input([
        h.Id("rule-confidence"),
        h.Type("range"),
        h.Min("0"),
        h.Max("100"),
        h.Step("1"),
        h.Value(String(percentage)),
        h.OnInput((value) =>
          UpdatedRuleConfidence({ confidenceThreshold: Number(value) / 100 }),
        ),
        h.Class("h-10 w-full cursor-pointer accent-primary"),
      ]),
    ],
  )
}

const advancedFields = (h: HtmlBuilder<Message>, draft: RuleDraft): Html =>
  h.section(
    [
      h.AriaLabelledBy("advanced-settings-title"),
      h.Class("mt-6 border-t pt-5"),
    ],
    [
      h.h4(
        [h.Id("advanced-settings-title"), h.Class("font-semibold")],
        ["Advanced behavior"],
      ),
      h.div(
        [h.Class("mt-4 grid gap-5 sm:grid-cols-2")],
        [
          field(
            h,
            "rule-kind",
            "Rule type",
            h.select(
              [
                h.Id("rule-kind"),
                h.Value(draft.kind),
                h.OnInput((value) =>
                  UpdatedRuleKind({ kind: ruleKindFrom(value) }),
                ),
                h.Class(inputClass),
              ],
              [
                h.option([h.Value("ai")], ["AI prompt"]),
                h.option([h.Value("ready-for-review")], ["Ready for review"]),
              ],
            ),
          ),
          field(
            h,
            "rule-mode",
            "Label behavior",
            h.select(
              [
                h.Id("rule-mode"),
                h.Value(draft.mode),
                ...(draft.kind === "ready-for-review"
                  ? [h.Disabled(true)]
                  : []),
                h.OnInput((value) =>
                  UpdatedRuleMode({ mode: ruleModeFrom(value) }),
                ),
                h.Class(inputClass),
              ],
              [
                h.option([h.Value("add-only")], ["Add only"]),
                h.option([h.Value("reconcile")], ["Reconcile"]),
              ],
            ),
          ),
          field(
            h,
            "rule-exclusive-group",
            "Exclusive group",
            h.input([
              h.Id("rule-exclusive-group"),
              h.Type("text"),
              h.Value(draft.exclusiveGroup),
              h.Placeholder("Optional group name"),
              h.OnInput((exclusiveGroup) =>
                UpdatedRuleExclusiveGroup({ exclusiveGroup }),
              ),
              h.Class(inputClass),
            ]),
          ),
        ],
      ),
    ],
  )

const modalLabel = (h: HtmlBuilder<Message>, id: string, label: string): Html =>
  h.label(
    [
      h.For(id),
      h.Class(
        "mb-2 block font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
      ),
    ],
    [label],
  )

const deleteModal = (h: HtmlBuilder<Message>, model: Model): Html => {
  if (model.deletion._tag === "DeleteClosed") return h.div([], [])
  const rule = model.deletion.rule
  const deleting = model.deletion._tag === "DeleteDeleting"
  return modalShell(
    h,
    "delete-rule-title",
    "Cancel deleting rule",
    DismissedDeleteRule(),
    [
      h.p(
        [
          h.Class(
            "font-mono text-[10px] font-semibold uppercase tracking-widest text-destructive",
          ),
        ],
        ["Delete rule"],
      ),
      h.h3(
        [h.Id("delete-rule-title"), h.Class("mt-2 text-xl font-semibold")],
        [`Delete ${rule.name}?`],
      ),
      ...(model.deletion._tag === "DeleteFailed"
        ? [errorBanner(h, model.deletion.message)]
        : []),
      h.p(
        [h.Class("mt-3 text-sm leading-6 text-muted-foreground")],
        [
          rule.enabled
            ? "This rule is currently enabled. Disable it from the table before deleting it."
            : "The rule will be removed from this repository. Its prior changes remain available in the audit history.",
        ],
      ),
      h.div(
        [
          h.Class(
            "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
          ),
        ],
        [
          h.button(
            [
              h.Type("button"),
              h.OnClick(DismissedDeleteRule()),
              h.Class(secondaryButton),
            ],
            ["Cancel"],
          ),
          h.button(
            [
              h.Type("button"),
              ...(rule.enabled || deleting ? [h.Disabled(true)] : []),
              h.OnClick(ConfirmedDeleteRule()),
              h.Class(
                "inline-flex min-h-10 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white outline-hidden hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
              ),
            ],
            [
              deleting
                ? "Deleting..."
                : rule.enabled
                  ? "Disable before deleting"
                  : "Delete rule",
            ],
          ),
        ],
      ),
    ],
    true,
  )
}

const testModal = (h: HtmlBuilder<Message>, model: Model): Html => {
  if (model.test._tag === "TestClosed") return h.div([], [])
  return modalShell(
    h,
    "rule-test-title",
    "Close rule test",
    DismissedRuleTest(),
    [testContent(h, model)],
  )
}

const testContent = (h: HtmlBuilder<Message>, model: Model): Html => {
  if (model.test._tag === "TestClosed") return h.div([], [])
  if (model.test._tag === "TestLoadingCandidates") {
    return h.section(
      [h.AriaLabelledBy("rule-test-title")],
      [
        h.h3(
          [h.Id("rule-test-title"), h.Class("font-semibold")],
          [`Test ${model.test.rule.name}`],
        ),
        h.p(
          [h.Class("mt-3 text-sm text-muted-foreground")],
          ["Loading recent open pull requests..."],
        ),
      ],
    )
  }
  if (model.test._tag === "TestResult")
    return testResult(h, model.test.rule, model.test.result)
  const running = model.test._tag === "TestRunning"
  return h.section(
    [h.AriaLabelledBy("rule-test-title")],
    [
      h.p(
        [
          h.Class(
            "font-mono text-[10px] font-semibold uppercase tracking-widest text-primary",
          ),
        ],
        ["No-write preview"],
      ),
      h.h3(
        [h.Id("rule-test-title"), h.Class("mt-1 font-semibold")],
        [`Test ${model.test.rule.name}`],
      ),
      h.p(
        [h.Class("mt-2 text-xs leading-5 text-muted-foreground")],
        [
          "Run only this rule against an existing pull request. No GitHub labels will be changed.",
        ],
      ),
      ...(model.test._tag === "TestFailed"
        ? [errorBanner(h, model.test.message)]
        : []),
      ...(model.test.candidates.length === 0
        ? [
            h.p(
              [h.Class("mt-4 text-sm text-muted-foreground")],
              ["No recent open pull requests are available."],
            ),
          ]
        : [
            h.div(
              [h.Class("mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]")],
              [
                field(
                  h,
                  "test-pr",
                  "Pull request",
                  h.select(
                    [
                      h.Id("test-pr"),
                      h.Value(String(model.test.selectedPullRequest ?? "")),
                      h.OnInput((value) =>
                        SelectedRuleTestCandidate({
                          pullRequestNumber: Number(value),
                        }),
                      ),
                      h.Class(inputClass),
                    ],
                    model.test.candidates.map((candidate) =>
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
                    ...(running ? [h.Disabled(true)] : []),
                    h.OnClick(RanRuleTest()),
                    h.Class(`self-end ${primaryButton}`),
                  ],
                  [running ? "Running..." : "Run test"],
                ),
              ],
            ),
          ]),
    ],
  )
}

const testResult = (
  h: HtmlBuilder<Message>,
  rule: Rule,
  result: typeof LabelingRuleManagement.TestLabelingRuleResponse.Type,
): Html =>
  h.section(
    [h.AriaLabelledBy("rule-test-title")],
    [
      h.p(
        [
          h.Class(
            `font-mono text-[10px] font-semibold uppercase tracking-widest ${result.applies ? "text-success" : "text-muted-foreground"}`,
          ),
        ],
        [
          `${result.applies ? "Would apply" : "Would not apply"} / ${Math.round(result.confidence * 100)}% confidence`,
        ],
      ),
      h.h3(
        [h.Id("rule-test-title"), h.Class("mt-1 font-semibold")],
        ["Rule test result"],
      ),
      h.div(
        [h.Class("mt-4 grid gap-4 rounded-xl border p-4 sm:grid-cols-2")],
        [
          resultItem(
            h,
            "Proposed additions",
            result.proposedLabelChanges.add.join(", ") || "None",
          ),
          resultItem(
            h,
            "Proposed removals",
            result.proposedLabelChanges.remove.join(", ") || "None",
          ),
          resultItem(
            h,
            "Threshold",
            `${Math.round(result.confidenceThreshold * 100)}%`,
          ),
          resultItem(h, "GitHub write", "None (preview only)"),
          h.div(
            [h.Class("sm:col-span-2")],
            [
              h.p(
                [
                  h.Class(
                    "font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
                  ),
                ],
                ["Classifier rationale"],
              ),
              h.p([h.Class("mt-2 text-sm leading-6")], [result.rationale]),
            ],
          ),
        ],
      ),
      h.div(
        [
          h.Class(
            "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
          ),
        ],
        [
          h.button(
            [
              h.Type("button"),
              h.OnClick(DismissedRuleTest()),
              h.Class(secondaryButton),
            ],
            ["Done"],
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(ResetRuleTest()),
              h.Class(primaryButton),
            ],
            ["Test another PR"],
          ),
        ],
      ),
      h.p(
        [h.Class("sr-only")],
        [
          `Tested ${rule.name} against pull request ${result.pullRequestNumber}.`,
        ],
      ),
    ],
  )

const resultItem = (
  h: HtmlBuilder<Message>,
  label: string,
  value: string,
): Html =>
  h.div(
    [],
    [
      h.p(
        [
          h.Class(
            "font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
          ),
        ],
        [label],
      ),
      h.p([h.Class("mt-2 text-sm font-medium")], [value]),
    ],
  )

const errorBanner = (h: HtmlBuilder<Message>, message: string): Html =>
  h.div(
    [
      h.Role("alert"),
      h.Class(
        "mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive",
      ),
    ],
    [message],
  )

const labelBadge = (h: HtmlBuilder<Message>, label: string): Html =>
  h.span(
    [
      h.Class(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground",
      ),
    ],
    [h.span([h.Class("size-1.5 rounded-full bg-primary")], []), label],
  )

const ruleModeFrom = (value: string): RuleMode =>
  value === "reconcile" ? "reconcile" : "add-only"
const ruleKindFrom = (value: string): RuleKind =>
  value === "ready-for-review" ? "ready-for-review" : "ai"
