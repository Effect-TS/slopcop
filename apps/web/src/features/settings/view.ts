import type { Html, HtmlBuilder } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import { ToggledEnabled, type Message } from "./message"
import type { Model } from "./model"

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.section(
    [
      h.AriaLabelledBy("settings-title"),
      h.Class("w-full self-stretch px-4 py-6 sm:px-6 lg:px-8"),
    ],
    [
      pageHeader(h, model),
      model.repository === null
        ? emptyState(h)
        : settingsRow(h, model, model.repository),
    ],
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
              h.Id("settings-title"),
              h.Class("text-2xl font-semibold tracking-tight sm:text-3xl"),
            ],
            ["Repository settings"],
          ),
          h.p(
            [h.Class("mt-2 max-w-2xl text-sm leading-6 text-muted-foreground")],
            ["Control how SlopCop patrols incoming pull requests."],
          ),
        ],
      ),
    ],
  )

const emptyState = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        "mt-6 rounded-2xl border border-dashed bg-card px-5 py-12 text-center shadow-sm",
      ),
    ],
    [
      h.p(
        [
          h.Class(
            "font-mono text-[10px] uppercase tracking-widest text-primary",
          ),
        ],
        ["Repository required"],
      ),
      h.h3([h.Class("mt-2 text-lg font-semibold")], ["Select a repository"]),
      h.p(
        [
          h.Class(
            "mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground",
          ),
        ],
        ["Choose a repository from the sidebar to manage its patrol setting."],
      ),
    ],
  )

type Repository = NonNullable<Model["repository"]>

const settingsRow = (
  h: HtmlBuilder<Message>,
  model: Model,
  repository: Repository,
): Html =>
  h.article(
    [
      h.AriaLabelledBy("settings-row-title"),
      h.Class("mt-6 overflow-hidden rounded-xl border bg-card shadow-sm"),
    ],
    [
      h.div(
        [
          h.Class(
            "flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5",
          ),
        ],
        [
          h.div(
            [h.Class("min-w-0")],
            [
              h.h3(
                [h.Id("settings-row-title"), h.Class("font-semibold")],
                ["Repository patrol"],
              ),
              h.p(
                [
                  h.Class(
                    "mt-1 truncate font-mono text-xs text-muted-foreground",
                  ),
                ],
                [repositoryNameFrom(repository)],
              ),
              h.p(
                [h.Class("mt-2 text-sm leading-5 text-muted-foreground")],
                ["Evaluate incoming pull requests against enabled rules."],
              ),
            ],
          ),
          h.div(
            [h.Class("flex shrink-0 items-center justify-between gap-4")],
            [
              h.span(
                [h.Class("text-sm text-muted-foreground")],
                [
                  model.saveState._tag === "SaveSaving"
                    ? "Saving..."
                    : model.enabled
                      ? "On"
                      : "Off",
                ],
              ),
              toggle(h, model, repository),
            ],
          ),
        ],
      ),
      ...(model.saveState._tag === "SaveFailed"
        ? [
            h.p(
              [
                h.Role("alert"),
                h.Class(
                  "border-t border-destructive/20 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive sm:px-5",
                ),
              ],
              [model.saveState.message],
            ),
          ]
        : []),
    ],
  )

const toggle = (
  h: HtmlBuilder<Message>,
  model: Model,
  repository: Repository,
): Html => {
  const saving = model.saveState._tag === "SaveSaving"
  const failed = model.saveState._tag === "SaveFailed"
  const action = model.enabled ? "Disable" : "Enable"
  return h.button(
    [
      h.Type("button"),
      h.Role("switch"),
      h.AriaChecked(model.enabled),
      h.AriaLabel(
        `${failed ? "Retry: " : ""}${action} patrol for ${repositoryNameFrom(repository)}`,
      ),
      ...(saving ? [h.Disabled(true)] : []),
      h.OnClick(ToggledEnabled()),
      h.Class(
        `relative h-7 w-12 shrink-0 rounded-full outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60 ${model.enabled ? "bg-primary" : "bg-muted-foreground/35"}`,
      ),
    ],
    [
      h.span(
        [
          h.Class(
            `absolute top-1 size-5 rounded-full bg-white shadow-sm transition-transform ${model.enabled ? "left-6" : "left-1"}`,
          ),
        ],
        [],
      ),
    ],
  )
}

const repositoryName = (model: Model): string =>
  model.repository === null
    ? "Select a repository"
    : repositoryNameFrom(model.repository)

const repositoryNameFrom = (repository: Repository): string =>
  `${repository.owner}/${repository.repo}`
