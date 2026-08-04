import * as UiCommand from "@slopcop/ui/Command"
import * as Popover from "@foldkit/ui/popover"
import type * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import type { ChildAttribute, Html, HtmlBuilder } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import * as Icon from "../../features/icon"
import type { Model } from "./model"
import { GotCommandMessage, GotPopoverMessage, type Message } from "./message"

type RepositoryOption = Readonly<{
  value: string
  owner: string
  repo: string
  isPrivate: boolean
  enabled: boolean
}>

const RepositoryCommand = UiCommand.create<RepositoryOption, string>()

const repositoryValue = (repository: {
  readonly owner: string
  readonly repo: string
}): string => `${repository.owner}/${repository.repo}`

const toRepositoryOption = (
  repository: RepositoryManagement.RepositorySummary,
): RepositoryOption => ({
  value: repositoryValue(repository),
  owner: repository.owner,
  repo: repository.repo,
  isPrivate: repository.isPrivate,
  enabled: repository.enabled,
})

const repositoryOptions = (model: Model): ReadonlyArray<RepositoryOption> => {
  switch (model.repositories._tag) {
    case "RepositoriesLoaded":
      return model.repositories.repositories.map(toRepositoryOption)
    case "RepositoriesLoading":
    case "RepositoriesFailed":
      return []
  }
}

const repositoryByValue = (
  repositories: ReadonlyArray<RepositoryOption>,
  value: string | null,
): RepositoryOption | null =>
  value === null
    ? null
    : (repositories.find((repository) => repository.value === value) ?? null)

const repositoryInitials = (repository: RepositoryOption): string =>
  repository.owner.slice(0, 2).toLocaleLowerCase()

const selectorPlaceholder = (model: Model): string => {
  switch (model.repositories._tag) {
    case "RepositoriesLoading":
      return "Loading repositories..."
    case "RepositoriesFailed":
      return "Repositories unavailable"
    case "RepositoriesLoaded":
      return "No repositories connected"
  }
}

const commandEmptyContent = (
  model: Model,
  repositories: ReadonlyArray<RepositoryOption>,
): string => {
  if (model.repositories._tag === "RepositoriesFailed") {
    return model.repositories.message
  }
  if (model.repositories._tag === "RepositoriesLoading") {
    return "Loading repositories..."
  }
  return repositories.length === 0
    ? "No repositories connected."
    : "No repositories found."
}

export const view = Submodel.defineView<Model, Message>((model, h) => {
  const slotId = "repository-selector"
  const labelId = `${slotId}-label`

  return h.submodel({
    slotId,
    model: model.popover,
    view: Popover.view,
    toParentMessage: (message) => GotPopoverMessage({ message }),
    viewInputs: {
      ariaLabelledBy: labelId,
      focusSelector: `#${UiCommand.inputId(model.command.id)}`,
      anchor: {
        placement: "bottom-end",
        gap: 6,
        padding: 8,
      },
      toView: popoverView({ labelId, h, model }),
    },
  })
})

interface PopoverViewInputs {
  readonly labelId: string
  readonly h: HtmlBuilder<Message>
  readonly model: Model
}

const popoverView =
  ({ labelId, h, model }: PopoverViewInputs) =>
  ({ backdrop, button, isVisible, panel }: Popover.RenderInfo): Html =>
    h.div(
      [
        h.Class(
          "relative flex shrink-0 w-full p-2 items-center group-data-[collapsed]/sidebar:justify-center",
        ),
      ],
      [
        selectorButton(h, model, labelId, button),
        ...selectorOverlay(h, model, isVisible, backdrop, panel),
      ],
    )

const selectorButton = (
  h: HtmlBuilder<Message>,
  model: Model,
  labelId: string,
  attributes: ReadonlyArray<ChildAttribute>,
): Html => {
  const repositories = repositoryOptions(model)
  const repository = repositoryByValue(repositories, model.selected)
  const label =
    repository === null
      ? `${selectorPlaceholder(model)}. Change repository`
      : `Selected repository ${repository.value}. Change repository`

  return h.button(
    [
      ...attributes,
      h.Class(
        "flex h-auto w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-2 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 group-data-[collapsed]/sidebar:size-10 group-data-[collapsed]/sidebar:justify-center group-data-[collapsed]/sidebar:p-2 dark:bg-input/30 dark:hover:bg-input/50 cursor-pointer",
      ),
    ],
    [
      h.label(
        [
          h.Id(labelId),
          h.For(Popover.buttonId(model.popover.id)),
          h.Class("sr-only"),
        ],
        [label],
      ),
      repository === null
        ? selectedRepositoryPlaceholder(h, selectorPlaceholder(model))
        : selectedRepository(h, repository),
      Icon.chevronsUpDown(
        "size-3.5 shrink-0 text-muted-foreground group-data-[collapsed]/sidebar:hidden",
      ),
    ],
  )
}

const selectedRepository = (
  h: HtmlBuilder<Message>,
  repository: RepositoryOption,
): Html =>
  h.span(
    [h.Class("flex min-w-0 items-center gap-2 text-left text-sm font-medium")],
    [
      h.span(
        [
          h.Class(
            "flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary font-mono text-[11px] font-semibold text-secondary-foreground uppercase",
          ),
          h.AriaHidden(true),
        ],
        [repositoryInitials(repository)],
      ),
      h.span(
        [
          h.Class(
            "flex min-w-0 flex-col group-data-[collapsed]/sidebar:hidden",
          ),
        ],
        [
          h.span(
            [
              h.Class(
                "truncate font-mono leading-tight text-xs text-foreground",
              ),
            ],
            [repository.value],
          ),
          h.span(
            [
              h.Class(
                `truncate text-[11px] leading-tight ${repository.enabled ? "text-success" : "text-muted-foreground"}`,
              ),
            ],
            [repository.enabled ? "Patrol enabled" : "Patrol disabled"],
          ),
        ],
      ),
    ],
  )

const selectedRepositoryPlaceholder = (
  h: HtmlBuilder<Message>,
  label: string,
): Html =>
  h.span(
    [h.Class("flex min-w-0 items-center gap-2 text-left text-sm font-medium")],
    [
      h.span(
        [
          h.Class(
            "flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary font-mono text-[11px] font-semibold text-muted-foreground uppercase",
          ),
          h.AriaHidden(true),
        ],
        ["--"],
      ),
      h.span(
        [h.Class("min-w-0 truncate text-xs text-muted-foreground")],
        [label],
      ),
    ],
  )

const selectorOverlay = (
  h: HtmlBuilder<Message>,
  model: Model,
  isVisible: boolean,
  backdrop: ReadonlyArray<ChildAttribute>,
  panel: ReadonlyArray<ChildAttribute>,
): ReadonlyArray<Html> =>
  isVisible
    ? [
        h.div([...backdrop, h.Class("fixed inset-0")]),
        h.div(
          [
            ...panel,
            h.Class(
              "z-10 w-(--button-width) min-w-72 flex flex-col gap-2.5 p-0 bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-md rounded-lg outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            ),
          ],
          [repositoryCommand(h, model)],
        ),
      ]
    : []

const repositoryCommand = (h: HtmlBuilder<Message>, model: Model): Html => {
  const repositories = repositoryOptions(model)
  return h.submodel({
    slotId: "repository-selector-command",
    model: model.command,
    view: RepositoryCommand.view,
    toParentMessage: (message) => GotCommandMessage({ message }),
    viewInputs: {
      items: repositories,
      ariaLabel: "Search repositories",
      inputPlaceholder: "Search repositories...",
      itemToValue: (repository) => repository.value,
      itemToSearchText: (repository) => repository.repo,
      itemToKeywords: (repository) => [repository.owner, repository.value],
      itemGroupKey: (repository) => repository.owner,
      groupToConfig: (owner) => ({ heading: owner }),
      itemToConfig: (repository) => ({
        content: repositoryItemContent(
          h,
          repository,
          repository.value === model.selected,
        ),
        className: [
          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left",
          "text-xs outline-hidden hover:bg-accent hover:text-accent-foreground",
        ].join(" "),
      }),
      empty: {
        content: commandEmptyContent(model, repositories),
        className: "px-3 py-6 text-center text-sm text-muted-foreground",
      },
      toView: commandToView(h),
    },
  })
}

const commandToView =
  (h: HtmlBuilder<Message>) =>
  (render: UiCommand.RenderInfo<string>): Html =>
    h.div(
      [
        ...render.root,
        h.Class(
          "flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground",
        ),
      ],
      [
        h.div(
          [...render.inputWrapper, h.Class("p-1 pb-0")],
          [
            h.div(
              [
                h.Class(
                  "flex h-8 items-center gap-2 px-2 rounded-lg border border-input/30 bg-input/30 dark:bg-input/30",
                ),
              ],
              [
                h.span(
                  [h.AriaHidden(true), h.Class("opacity-50")],
                  [Icon.search()],
                ),
                h.input([
                  ...render.input,
                  h.Class(
                    "w-full text-sm placeholder:text-muted-foreground outline-hidden focus-visible:outline-hidden focus-visible:ring-0",
                  ),
                ]),
              ],
            ),
          ],
        ),
        h.div(
          [...render.list, h.Class("flex max-h-80 flex-col overflow-y-auto")],
          [
            ...(render.empty
              ? [h.div([...render.empty.attributes], [render.empty.content])]
              : []),
            ...render.groups.flatMap((group) => [
              h.div(
                [...group.group, h.Class("flex flex-col p-1 text-xs")],
                [
                  ...(group.headingContent === undefined
                    ? []
                    : [
                        h.div(
                          [
                            ...group.heading,
                            h.Class(
                              "px-2 py-1.5 font-medium text-muted-foreground",
                            ),
                          ],
                          [group.headingContent],
                        ),
                      ]),
                  ...group.items.map((item) =>
                    h.div([...item.item], [item.content]),
                  ),
                ],
              ),
            ]),
          ],
        ),
        commandFooter(h),
      ],
    )

const commandFooter = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("border-t border-border/80")],
    [
      h.div(
        [h.Class("flex flex-col gap-1 py-2 px-1.5")],
        [
          commandFooterAction(h, Icon.plus("size-3.5"), "Add repository"),
          commandFooterAction(h, Icon.plug("size-3.5"), "Manage connections"),
        ],
      ),
      h.p(
        [
          h.Class(
            "border-t border-border/80 px-3 pt-2 pb-1 text-[11px] leading-relaxed text-muted-foreground",
          ),
        ],
        [
          "Every metric, queue, rule and incident report below belongs to the selected repository.",
        ],
      ),
    ],
  )

const commandFooterAction = (
  h: HtmlBuilder<Message>,
  icon: Html,
  label: string,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground cursor-pointer",
      ),
    ],
    [
      h.span(
        [
          h.AriaHidden(true),
          h.Class("flex size-3.5 shrink-0 items-center justify-center"),
        ],
        [icon],
      ),
      h.span([], [label]),
    ],
  )

const repositoryItemContent = (
  h: HtmlBuilder<Message>,
  repository: RepositoryOption,
  isSelected: boolean,
): Html =>
  h.span(
    [h.Class("flex min-w-0 flex-1 items-center gap-2")],
    [
      h.span(
        [h.AriaHidden(true), h.Class("text-muted-foreground")],
        [Icon.gitBranch("size-3.5")],
      ),
      h.span([h.Class("min-w-0 flex-1 truncate font-mono")], [repository.repo]),
      repositoryPrivacySlot(h, repository),
      repositoryPatrolSlot(h, repository),
      repositorySelectionSlot(h, isSelected),
    ],
  )

const repositoryPrivacySlot = (
  h: HtmlBuilder<Message>,
  repository: RepositoryOption,
): Html =>
  h.span(
    [
      h.AriaHidden(true),
      h.Class(
        "flex size-3.5 shrink-0 items-center justify-center text-muted-foreground",
      ),
    ],
    repository.isPrivate
      ? [
          Icon.lock("size-3"),
          h.span([h.Class("sr-only")], ["Private repository"]),
        ]
      : [],
  )

const repositoryPatrolSlot = (
  h: HtmlBuilder<Message>,
  repository: RepositoryOption,
): Html =>
  h.span(
    [
      h.Class(
        `flex shrink-0 items-center gap-1.5 ${repository.enabled ? "text-success" : "text-muted-foreground"}`,
      ),
    ],
    [
      h.span([
        h.Class(
          `size-1.5 rounded-full ${repository.enabled ? "bg-success" : "bg-muted-foreground/45"}`,
        ),
      ]),
      h.span([], [repository.enabled ? "Enabled" : "Disabled"]),
    ],
  )

const repositorySelectionSlot = (
  h: HtmlBuilder<Message>,
  isSelected: boolean,
): Html =>
  h.span(
    [
      h.AriaHidden(true),
      h.Class(
        "flex size-3.5 shrink-0 items-center justify-center text-primary",
      ),
    ],
    isSelected ? [Icon.check("size-3.5")] : [],
  )
