import type { Html, HtmlBuilder } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import * as Icon from "../icon"
import {
  ClosedRuleEditor,
  ConfirmedDeleteRule,
  DismissedDeleteRule,
  DismissedRuleTest,
  OpenedDeleteRule,
  OpenedRuleEditor,
  OpenedRuleTest,
  RanRuleTest,
  ResetRuleTest,
  ToggledRule,
  ToggledRuleMenu,
  UpdatedRuleConfidence,
  UpdatedRuleExclusiveGroup,
  UpdatedRuleKind,
  UpdatedRuleLabel,
  UpdatedRuleMode,
  UpdatedRulePrompt,
  type Message,
} from "./message"
import type { Model, RuleId, RuleKind, RuleMode } from "./model"

type Rule = Readonly<{
  id: RuleId
  name: string
  label: string
  color: string
  matches: string
}>

const documentationRule: Rule = {
  id: "Documentation",
  name: "Documentation patrol",
  label: "documentation",
  color: "bg-cyan-500",
  matches: "128 matches",
}

const bugRule: Rule = {
  id: "Bug",
  name: "Bug probable cause",
  label: "bug",
  color: "bg-red-500",
  matches: "214 matches",
}

const dependenciesRule: Rule = {
  id: "Dependencies",
  name: "Dependency disturbance",
  label: "dependencies",
  color: "bg-emerald-500",
  matches: "342 matches",
}

const rules: ReadonlyArray<Rule> = [
  documentationRule,
  bugRule,
  dependenciesRule,
]

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm outline-hidden hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50"

const secondaryButton =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.section(
    [
      h.AriaLabelledBy("auto-labeling-title"),
      h.Class("w-full self-stretch px-4 py-6 sm:px-6 lg:px-8"),
    ],
    [pageHeader(h), tableView(h, model)],
  ),
)

const pageHeader = (h: HtmlBuilder<Message>): Html =>
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
            ["effect/slopcop"],
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
        [h.Type("button"), h.Class(primaryButton)],
        [Icon.plus(), "New rule"],
      ),
    ],
  )

const tableView = (h: HtmlBuilder<Message>, model: Model): Html =>
  h.div(
    [h.Class("mt-6")],
    [
      h.div(
        [h.Class("grid gap-3 sm:grid-cols-3")],
        [
          metricCard(h, "Live rules", "2", "Writing labels to GitHub"),
          metricCard(h, "Paused rules", "1", "Kept in the rule book"),
          metricCard(h, "Total fires", "684", "Across the last 30 days"),
        ],
      ),
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
                ["3 configured"],
              ),
            ],
          ),
          h.div(
            [h.Class("overflow-x-auto")],
            [
              h.table(
                [h.Class("w-full min-w-[62rem] border-collapse text-left")],
                [
                  h.thead(
                    [h.Class("bg-muted/35 text-xs text-muted-foreground")],
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
                    rules.map((rule, index) => tableRow(h, model, rule, index)),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      ...(model.editingRule === null
        ? []
        : [ruleEditorModal(h, model, ruleById(model.editingRule))]),
      ...(model.testingRule === null
        ? []
        : [ruleTestModal(h, model, ruleById(model.testingRule))]),
      ...(model.deletingRule === null
        ? []
        : [deleteRuleModal(h, model, ruleById(model.deletingRule))]),
    ],
  )

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
  className: string = "",
): Html => h.th([h.Class(`px-4 py-3 font-medium ${className}`)], [label])

const tableRow = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
  index: number,
): Html => {
  const enabled = isRuleEnabled(model, rule.id)

  return h.tr(
    [h.Class(enabled ? "" : "bg-muted/15 text-muted-foreground")],
    [
      h.td([h.Class("px-4 py-4 align-top")], [ruleToggle(h, rule, enabled)]),
      h.td(
        [h.Class("px-4 py-4")],
        [
          h.div(
            [h.Class("flex items-baseline gap-2")],
            [
              h.span(
                [h.Class("font-mono text-[10px] text-muted-foreground")],
                [`0${index + 1}`],
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
            [promptFor(model, rule.id)],
          ),
        ],
      ),
      h.td(
        [h.Class("px-4 py-4 align-top")],
        [labelBadge(h, rule, labelFor(model, rule.id))],
      ),
      h.td(
        [
          h.Class(
            "px-4 py-4 text-right align-top font-mono text-sm tabular-nums",
          ),
        ],
        [`${confidenceFor(model, rule.id)}%`],
      ),
      h.td(
        [
          h.Class(
            "px-4 py-4 text-right align-top font-mono text-sm tabular-nums",
          ),
        ],
        [rule.matches.replace(" matches", "")],
      ),
      h.td(
        [h.Class("px-4 py-4 align-top")],
        [
          h.span(
            [
              h.Class(
                enabled
                  ? "rounded-full border border-success/25 bg-success/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-success"
                  : "rounded-full border bg-muted px-2 py-1 font-mono text-[10px] font-semibold uppercase text-muted-foreground",
              ),
            ],
            [enabled ? "Live" : "Paused"],
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

const ruleActionsMenu = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html => {
  const isOpen = model.openRuleMenu === rule.id

  return h.div(
    [h.Class("relative inline-block text-left")],
    [
      h.button(
        [
          h.Type("button"),
          h.AriaLabel(`Actions for ${rule.name}`),
          h.AriaExpanded(isOpen),
          h.OnClick(ToggledRuleMenu({ ruleId: rule.id })),
          h.Class(
            "grid size-8 place-items-center rounded-md font-mono text-base tracking-widest text-muted-foreground outline-hidden hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          ),
        ],
        ["..."],
      ),
      ...(isOpen
        ? [
            h.div(
              [
                h.Role("menu"),
                h.Class(
                  "absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-left text-popover-foreground shadow-lg",
                ),
              ],
              [
                ruleMenuButton(
                  h,
                  "Edit rule",
                  OpenedRuleEditor({ ruleId: rule.id }),
                ),
                ruleMenuButton(
                  h,
                  "Test rule",
                  OpenedRuleTest({ ruleId: rule.id }),
                ),
                h.div([h.Class("my-1 border-t")], []),
                ruleMenuButton(
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

const ruleMenuButton = (
  h: HtmlBuilder<Message>,
  label: string,
  message: Message,
  destructive: boolean = false,
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

const ruleToggle = (
  h: HtmlBuilder<Message>,
  rule: Rule,
  enabled: boolean,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Role("switch"),
      h.AriaChecked(enabled),
      h.AriaLabel(`${enabled ? "Disable" : "Enable"} ${rule.name}`),
      h.OnClick(ToggledRule({ ruleId: rule.id })),
      h.Class(
        `relative h-6 w-11 rounded-full outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`,
      ),
    ],
    [
      h.span(
        [
          h.Class(
            `absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "left-6" : "left-1"}`,
          ),
        ],
        [],
      ),
    ],
  )

const ruleEditorModal = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html =>
  h.div(
    [
      h.Role("dialog"),
      h.AriaModal(true),
      h.AriaLabelledBy("rule-editor-title"),
      h.Class("fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.AriaLabel("Close rule editor"),
          h.OnClick(ClosedRuleEditor()),
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
                    ["Edit rule prompt"],
                  ),
                  h.h3(
                    [
                      h.Id("rule-editor-title"),
                      h.Class("mt-2 text-xl font-semibold"),
                    ],
                    [rule.name],
                  ),
                  h.div(
                    [h.Class("mt-3")],
                    [labelBadge(h, rule, labelFor(model, rule.id))],
                  ),
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
          h.p(
            [h.Class("mt-5 text-sm leading-6 text-muted-foreground")],
            [
              "Describe when this label should be applied. Include exclusions when nearby changes should not match.",
            ],
          ),
          modalRuleControls(h, model, rule),
          promptField(h, model, rule, "mt-4"),
          h.p(
            [
              h.Class(
                "mt-1 text-right font-mono text-[10px] text-muted-foreground",
              ),
            ],
            [`${promptFor(model, rule.id).length} / 4,000 characters`],
          ),
          modalAdvancedControls(h, model, rule),
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
                  h.OnClick(ClosedRuleEditor()),
                  h.Class(primaryButton),
                ],
                ["Save changes"],
              ),
            ],
          ),
        ],
      ),
    ],
  )

const modalAdvancedControls = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html => {
  const kind = kindFor(model, rule.id)
  const mode = modeFor(model, rule.id)

  return h.section(
    [
      h.AriaLabelledBy("advanced-settings-title"),
      h.Class("mt-6 border-t pt-5"),
    ],
    [
      h.div(
        [],
        [
          h.h4(
            [h.Id("advanced-settings-title"), h.Class("font-semibold")],
            ["Advanced behavior"],
          ),
          h.p(
            [h.Class("mt-1 text-xs leading-5 text-muted-foreground")],
            [
              "Control how this rule is evaluated and how matching labels are written.",
            ],
          ),
        ],
      ),
      h.div(
        [h.Class("mt-4 grid gap-5 sm:grid-cols-2")],
        [
          h.div(
            [],
            [
              modalLabel(h, `kind-${rule.id}`, "Rule type"),
              h.select(
                [
                  h.Id(`kind-${rule.id}`),
                  h.Value(kind),
                  h.OnInput((value) =>
                    UpdatedRuleKind({
                      ruleId: rule.id,
                      kind: ruleKindFrom(value),
                    }),
                  ),
                  h.Class(
                    "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20",
                  ),
                ],
                [
                  h.option([h.Value("ai")], ["AI prompt"]),
                  h.option([h.Value("ready-for-review")], ["Ready for review"]),
                ],
              ),
              h.p(
                [h.Class("mt-2 text-xs leading-5 text-muted-foreground")],
                [
                  kind === "ai"
                    ? "Classifies pull requests using this prompt."
                    : "Uses deterministic readiness checks and requires reconcile mode.",
                ],
              ),
            ],
          ),
          h.div(
            [],
            [
              modalLabel(h, `mode-${rule.id}`, "Label behavior"),
              h.select(
                [
                  h.Id(`mode-${rule.id}`),
                  h.Value(mode),
                  ...(kind === "ready-for-review" ? [h.Disabled(true)] : []),
                  h.OnInput((value) =>
                    UpdatedRuleMode({
                      ruleId: rule.id,
                      mode: ruleModeFrom(value),
                    }),
                  ),
                  h.Class(
                    "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20",
                  ),
                ],
                [
                  h.option([h.Value("add-only")], ["Add only"]),
                  h.option([h.Value("reconcile")], ["Reconcile"]),
                ],
              ),
              h.p(
                [h.Class("mt-2 text-xs leading-5 text-muted-foreground")],
                [
                  mode === "add-only"
                    ? "Never removes labels when the rule stops matching."
                    : "Removes the label when the rule no longer matches.",
                ],
              ),
            ],
          ),
          h.div(
            [],
            [
              modalLabel(h, `exclusive-group-${rule.id}`, "Exclusive group"),
              h.input([
                h.Id(`exclusive-group-${rule.id}`),
                h.Type("text"),
                h.Value(exclusiveGroupFor(model, rule.id)),
                h.Placeholder("Optional group name"),
                h.OnInput((exclusiveGroup) =>
                  UpdatedRuleExclusiveGroup({
                    ruleId: rule.id,
                    exclusiveGroup,
                  }),
                ),
                h.Class(
                  "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-hidden placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20",
                ),
              ]),
              h.p(
                [h.Class("mt-2 text-xs leading-5 text-muted-foreground")],
                ["Only one rule in a group may match a pull request."],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

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

const ruleTestModal = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html =>
  h.div(
    [
      h.Role("dialog"),
      h.AriaModal(true),
      h.AriaLabelledBy("rule-test-title"),
      h.Class("fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.AriaLabel("Close rule test"),
          h.OnClick(DismissedRuleTest()),
          h.Class("absolute inset-0 bg-black/65 backdrop-blur-[2px]"),
        ],
        [],
      ),
      h.div(
        [
          h.Class(
            "relative z-10 max-h-[calc(100svh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card shadow-2xl sm:max-h-[calc(100svh-3rem)]",
          ),
        ],
        [ruleTestContent(h, model, rule)],
      ),
    ],
  )

const ruleTestContent = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html => {
  switch (model.ruleTestStage) {
    case "Closed":
      return h.div([], [])
    case "Configure":
      return ruleTestConfigureView(h, rule)
    case "Result":
      return ruleTestResultView(h, model, rule)
  }
}

const ruleTestConfigureView = (h: HtmlBuilder<Message>, rule: Rule): Html =>
  h.section(
    [
      h.AriaLabelledBy("rule-test-title"),
      h.Class("rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5"),
    ],
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
                ["No-write preview"],
              ),
              h.h4(
                [h.Id("rule-test-title"), h.Class("mt-1 font-semibold")],
                [`Test ${rule.name}`],
              ),
            ],
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(DismissedRuleTest()),
              h.Class("text-sm text-muted-foreground hover:text-foreground"),
            ],
            ["Close"],
          ),
        ],
      ),
      h.p(
        [h.Class("mt-2 text-xs leading-5 text-muted-foreground")],
        [
          "Choose an existing pull request. SlopCop will run only this processor and will not change labels on GitHub.",
        ],
      ),
      h.div(
        [h.Class("mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]")],
        [
          h.div(
            [],
            [
              modalLabel(h, `test-pr-${rule.id}`, "Pull request"),
              h.select(
                [
                  h.Id(`test-pr-${rule.id}`),
                  h.Class(
                    "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20",
                  ),
                ],
                [
                  h.option(
                    [h.Value("1842")],
                    ["#1842 Improve getting-started guide"],
                  ),
                  h.option(
                    [h.Value("1837")],
                    ["#1837 Fix queue retry regression"],
                  ),
                  h.option(
                    [h.Value("1809")],
                    ["#1809 Update Effect dependencies"],
                  ),
                ],
              ),
            ],
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(RanRuleTest()),
              h.Class(`self-end ${primaryButton}`),
            ],
            ["Run test"],
          ),
        ],
      ),
    ],
  )

const ruleTestResultView = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html => {
  const confidence = testConfidence(rule.id)
  const threshold = confidenceFor(model, rule.id)
  const applies = confidence >= threshold

  return h.section(
    [
      h.AriaLabelledBy("rule-test-result-title"),
      h.Class(
        `overflow-hidden rounded-2xl border ${applies ? "border-success/25" : "border-border"}`,
      ),
    ],
    [
      h.div(
        [
          h.Class(
            `flex items-start justify-between gap-4 p-4 sm:p-5 ${applies ? "bg-success/8" : "bg-muted/30"}`,
          ),
        ],
        [
          h.div(
            [],
            [
              h.p(
                [
                  h.Class(
                    `font-mono text-[10px] font-semibold uppercase tracking-widest ${applies ? "text-success" : "text-muted-foreground"}`,
                  ),
                ],
                [
                  `${applies ? "Would apply" : "Would not apply"} / ${confidence}% confidence`,
                ],
              ),
              h.h4(
                [h.Id("rule-test-result-title"), h.Class("mt-1 font-semibold")],
                ["Rule test result"],
              ),
            ],
          ),
          labelBadge(h, rule, labelFor(model, rule.id)),
        ],
      ),
      h.div(
        [h.Class("grid gap-4 p-4 sm:grid-cols-2 sm:p-5")],
        [
          testResultItem(
            h,
            "Proposed change",
            applies
              ? `Add the ${labelFor(model, rule.id)} label`
              : "No GitHub label changes",
          ),
          testResultItem(
            h,
            "Threshold",
            `${confidence}% is ${applies ? "above" : "below"} the configured ${threshold}%`,
          ),
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
              h.p(
                [h.Class("mt-2 text-sm leading-6")],
                [testRationale(rule.id)],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [
          h.Class(
            "flex flex-col-reverse gap-2 border-t bg-muted/20 p-4 sm:flex-row sm:justify-end",
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
    ],
  )
}

const testConfidence = (ruleId: RuleId): number => {
  switch (ruleId) {
    case "Documentation":
      return 92
    case "Bug":
      return 31
    case "Dependencies":
      return 18
  }
}

const testRationale = (ruleId: RuleId): string => {
  switch (ruleId) {
    case "Documentation":
      return "The title and changed files indicate a user-facing guide update, which directly matches this rule's instructions."
    case "Bug":
      return "The pull request improves documentation and does not describe incorrect behavior or a regression being corrected."
    case "Dependencies":
      return "No dependency manifests or lockfiles are changed, so the update does not satisfy this processor."
  }
}

const testResultItem = (
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

const deleteRuleModal = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html => {
  const enabled = isRuleEnabled(model, rule.id)

  return h.div(
    [
      h.Role("alertdialog"),
      h.AriaModal(true),
      h.AriaLabelledBy("delete-rule-title"),
      h.Class("fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.AriaLabel("Cancel deleting rule"),
          h.OnClick(DismissedDeleteRule()),
          h.Class("absolute inset-0 bg-black/65 backdrop-blur-[2px]"),
        ],
        [],
      ),
      h.div(
        [
          h.Class(
            "relative z-10 w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl sm:p-6",
          ),
        ],
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
          h.p(
            [h.Class("mt-3 text-sm leading-6 text-muted-foreground")],
            [
              enabled
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
                  ...(enabled ? [h.Disabled(true)] : []),
                  h.OnClick(ConfirmedDeleteRule()),
                  h.Class(
                    "inline-flex min-h-10 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white outline-hidden hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                  ),
                ],
                [enabled ? "Disable before deleting" : "Delete rule"],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

const githubLabels: ReadonlyArray<string> = [
  "documentation",
  "bug",
  "dependencies",
  "enhancement",
  "performance",
  "security",
  "breaking-change",
]

const modalRuleControls = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
): Html => {
  const confidence = confidenceFor(model, rule.id)

  return h.div(
    [
      h.Class(
        "mt-5 grid gap-5 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2",
      ),
    ],
    [
      h.div(
        [],
        [
          h.label(
            [
              h.For(`label-${rule.id}`),
              h.Class(
                "mb-2 block font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
              ),
            ],
            ["GitHub label"],
          ),
          h.select(
            [
              h.Id(`label-${rule.id}`),
              h.Value(labelFor(model, rule.id)),
              h.OnInput((label) =>
                UpdatedRuleLabel({ ruleId: rule.id, label }),
              ),
              h.Class(
                "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20",
              ),
            ],
            githubLabels.map((label) => h.option([h.Value(label)], [label])),
          ),
          h.p(
            [h.Class("mt-2 text-xs leading-5 text-muted-foreground")],
            ["Populated from labels available in this repository."],
          ),
        ],
      ),
      h.div(
        [],
        [
          h.div(
            [h.Class("mb-2 flex items-center justify-between gap-3")],
            [
              h.label(
                [
                  h.For(`confidence-${rule.id}`),
                  h.Class(
                    "font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
                  ),
                ],
                ["Confidence threshold"],
              ),
              h.output(
                [
                  h.For(`confidence-${rule.id}`),
                  h.Class(
                    "font-mono text-sm font-semibold tabular-nums text-primary",
                  ),
                ],
                [`${confidence}%`],
              ),
            ],
          ),
          h.input([
            h.Id(`confidence-${rule.id}`),
            h.Type("range"),
            h.Min("50"),
            h.Max("100"),
            h.Step("5"),
            h.Value(String(confidence)),
            h.OnInput((value) =>
              UpdatedRuleConfidence({
                ruleId: rule.id,
                confidence: Number(value),
              }),
            ),
            h.Class("h-10 w-full cursor-pointer accent-primary"),
          ]),
          h.div(
            [
              h.Class(
                "flex justify-between font-mono text-[10px] text-muted-foreground",
              ),
            ],
            [h.span([], ["50%"]), h.span([], ["100%"])],
          ),
          h.p(
            [h.Class("mt-2 text-xs leading-5 text-muted-foreground")],
            ["Only apply the label when confidence meets this value."],
          ),
        ],
      ),
    ],
  )
}

const promptField = (
  h: HtmlBuilder<Message>,
  model: Model,
  rule: Rule,
  className: string,
): Html =>
  h.div(
    [h.Class(className)],
    [
      h.label(
        [
          h.For(`prompt-${rule.id}`),
          h.Class(
            "mb-2 block font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
          ),
        ],
        ["Rule prompt"],
      ),
      h.textarea([
        h.Id(`prompt-${rule.id}`),
        h.Value(promptFor(model, rule.id)),
        h.OnInput((prompt) => UpdatedRulePrompt({ ruleId: rule.id, prompt })),
        h.Class(
          "min-h-40 w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 text-foreground shadow-xs outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20",
        ),
      ]),
    ],
  )

const labelBadge = (
  h: HtmlBuilder<Message>,
  rule: Rule,
  label: string = rule.label,
): Html =>
  h.span(
    [
      h.Class(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground",
      ),
    ],
    [h.span([h.Class(`size-1.5 rounded-full ${rule.color}`)], []), label],
  )

const ruleById = (ruleId: RuleId): Rule => {
  switch (ruleId) {
    case "Documentation":
      return documentationRule
    case "Bug":
      return bugRule
    case "Dependencies":
      return dependenciesRule
  }
}

const isRuleEnabled = (model: Model, ruleId: RuleId): boolean => {
  switch (ruleId) {
    case "Documentation":
      return model.documentationEnabled
    case "Bug":
      return model.bugEnabled
    case "Dependencies":
      return model.dependenciesEnabled
  }
}

const labelFor = (model: Model, ruleId: RuleId): string => {
  switch (ruleId) {
    case "Documentation":
      return model.documentationLabel
    case "Bug":
      return model.bugLabel
    case "Dependencies":
      return model.dependenciesLabel
  }
}

const confidenceFor = (model: Model, ruleId: RuleId): number => {
  switch (ruleId) {
    case "Documentation":
      return model.documentationConfidence
    case "Bug":
      return model.bugConfidence
    case "Dependencies":
      return model.dependenciesConfidence
  }
}

const modeFor = (model: Model, ruleId: RuleId): RuleMode => {
  switch (ruleId) {
    case "Documentation":
      return model.documentationMode
    case "Bug":
      return model.bugMode
    case "Dependencies":
      return model.dependenciesMode
  }
}

const kindFor = (model: Model, ruleId: RuleId): RuleKind => {
  switch (ruleId) {
    case "Documentation":
      return model.documentationKind
    case "Bug":
      return model.bugKind
    case "Dependencies":
      return model.dependenciesKind
  }
}

const exclusiveGroupFor = (model: Model, ruleId: RuleId): string => {
  switch (ruleId) {
    case "Documentation":
      return model.documentationExclusiveGroup
    case "Bug":
      return model.bugExclusiveGroup
    case "Dependencies":
      return model.dependenciesExclusiveGroup
  }
}

const ruleModeFrom = (value: string): RuleMode =>
  value === "reconcile" ? "reconcile" : "add-only"

const ruleKindFrom = (value: string): RuleKind =>
  value === "ready-for-review" ? "ready-for-review" : "ai"

const promptFor = (model: Model, ruleId: RuleId): string => {
  switch (ruleId) {
    case "Documentation":
      return model.documentationPrompt
    case "Bug":
      return model.bugPrompt
    case "Dependencies":
      return model.dependenciesPrompt
  }
}
