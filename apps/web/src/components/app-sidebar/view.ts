import * as Sidebar from "@slopcop/ui/Sidebar"
import {
  type ChildAttribute,
  type Html,
  type HtmlBuilder,
  inertHtml as ih,
} from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import * as Icon from "../../features/icon"
import * as RepositorySelector from "../repository-selector"
import * as Theme from "../../features/theme"
import {
  type Message,
  GotRepositorySelectorMessage,
  GotSidebarMessage,
  GotThemeMessage,
} from "./message"
import type { Model } from "./model"

export interface RenderInfo {
  readonly trigger: ReadonlyArray<ChildAttribute>
}

export type ViewInputs = Readonly<{
  toView: (render: RenderInfo) => Html
}>

export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, inputs, h) =>
    h.submodel({
      slotId: "app-sidebar",
      model: model.sidebar,
      view: Sidebar.view,
      toParentMessage: (message) => GotSidebarMessage({ message }),
      viewInputs: {
        toView: (info) =>
          info._tag === "Desktop"
            ? desktopSidebar(h, model, {
                ...info,
                ...inputs,
                isCollapsed: info.desktopState === "Collapsed",
              })
            : mobileSidebar(h, model, {
                ...info,
                ...inputs,
                isCollapsed: false,
              }),
      },
    }),
)

type DesktopSidebarProps = Sidebar.DesktopRenderInfo &
  ViewInputs &
  Readonly<{
    isCollapsed: boolean
  }>

const desktopSidebar = (
  h: HtmlBuilder<Message>,
  model: Model,
  { button, layout, panel, toView, isCollapsed }: DesktopSidebarProps,
): Html => {
  const content = toView({ trigger: button })
  const main = mainContent(h, model, {
    content,
    sidebarTrigger: button,
  })
  const sidebar = sidebarContent(h, model, isCollapsed)

  return h.div(
    [...layout, h.Class("flex min-h-svh")],
    [
      h.aside(
        [
          ...panel,
          ...(isCollapsed ? [h.DataAttribute("collapsed", "")] : []),
          h.Class(
            `group/sidebar sticky top-0 shrink-0 flex flex-col h-svh bg-sidebar border-r border-sidebar-border text-white overflow-hidden transition-[width] duration-200 ${isCollapsed ? "w-[4.5rem]" : "w-64"}`,
          ),
        ],
        [sidebar],
      ),
      main,
    ],
  )
}

type MobileSidebarProps = Sidebar.MobileRenderInfo &
  ViewInputs &
  Readonly<{
    isCollapsed: boolean
  }>

const mobileSidebar = (
  h: HtmlBuilder<Message>,
  model: Model,
  {
    backdrop,
    button,
    closeButton,
    dialog,
    description,
    initialFocus,
    isCollapsed,
    isVisible,
    layout,
    panel,
    title,
    toView,
  }: MobileSidebarProps,
): Html => {
  const content = toView({ trigger: button })
  const main = mainContent(h, model, {
    content,
    sidebarTrigger: button,
  })

  return h.div(
    [...layout, h.Class("min-h-svh")],
    [
      main,
      h.dialog(
        [...dialog],
        [
          ...(isVisible
            ? [
                h.div(
                  [
                    ...backdrop,
                    h.Class(
                      "fixed inset-0 bg-black/60 data-[closed]:opacity-0 data-[transition]:transition-opacity data-[transition]:duration-200",
                    ),
                  ],
                  [],
                ),
                h.aside(
                  [
                    ...panel,
                    h.Class(
                      "fixed inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl data-[closed]:-translate-x-full data-[transition]:transition-transform data-[transition]:duration-200",
                    ),
                  ],
                  [
                    h.h2([...title, h.Class("sr-only")], ["Navigation"]),
                    h.p(
                      [...description, h.Class("sr-only")],
                      ["Repository and dashboard navigation"],
                    ),
                    h.button(
                      [
                        ...closeButton,
                        ...initialFocus,
                        h.AriaLabel("Close sidebar"),
                        h.Class(
                          "absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-lg text-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        ),
                      ],
                      ["×"],
                    ),
                    sidebarContent(h, model, isCollapsed),
                  ],
                ),
              ]
            : []),
        ],
      ),
    ],
  )
}

const mainContent = (
  h: HtmlBuilder<Message>,
  model: Model,
  {
    content,
    sidebarTrigger,
  }: {
    readonly content: Html
    readonly sidebarTrigger: ReadonlyArray<ChildAttribute>
  },
): Html =>
  h.main(
    [h.Class("min-w-0 flex-1 bg-background text-foreground")],
    [
      mainHeader(h, model, { sidebarTrigger }),
      h.div(
        [h.Class("grid min-h-[calc(100svh-4rem)] place-items-center p-6")],
        [content],
      ),
    ],
  )

const sidebarContent = (
  h: HtmlBuilder<Message>,
  model: Model,
  isCollapsed: boolean,
): Html => {
  const header = sidebarHeader(isCollapsed)

  const repositorySelector = h.submodel({
    slotId: "repository-selector",
    model: model.repositorySelector,
    view: RepositorySelector.view,
    toParentMessage: (message) => GotRepositorySelectorMessage({ message }),
  })

  return h.div(
    [h.Class("flex h-full w-full shrink-0 flex-col")],
    [header, repositorySelector],
  )
}

const sidebarHeader = (isCollapsed: boolean): Html =>
  ih.div(
    [ih.Class("flex flex-col p-2 gap-3")],
    [
      ih.div(
        [
          ih.Class(
            `flex items-center gap-2.5 px-1 pt-1 ${isCollapsed ? "justify-center" : ""}`,
          ),
        ],
        [
          ih.span(
            [
              ih.Class(
                "flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/25",
              ),
            ],
            [Icon.slopCopLogo()],
          ),
          ...(isCollapsed
            ? []
            : [
                ih.div(
                  [ih.Class("flex min-w-0 flex-col")],
                  [
                    ih.span(
                      [
                        ih.Class(
                          "truncate text-sm text-foreground leading-tight font-semibold tracking-tight",
                        ),
                      ],
                      ["SlopCop"],
                    ),
                    ih.span(
                      [
                        ih.Class(
                          "truncate text-[11px] leading-tight text-muted-foreground",
                        ),
                      ],
                      ["Keeping your repos in line."],
                    ),
                  ],
                ),
              ]),
        ],
      ),
    ],
  )

const mainHeader = (
  h: HtmlBuilder<Message>,
  model: Model,
  {
    sidebarTrigger,
  }: { readonly sidebarTrigger: ReadonlyArray<ChildAttribute> },
): Html =>
  h.header(
    [
      h.Class(
        "h-16 flex justify-between items-center px-6 md:px-4 bg-background/85 border-b border-border",
      ),
    ],
    [
      h.div(
        [h.Class("flex gap-3")],
        [
          h.button(
            [
              ...sidebarTrigger,
              ih.AriaLabel("Toggle sidebar"),
              ih.Class(
                "px-3 py-2 bg-card hover:bg-muted dark:hover:bg-input/50 border border-border focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg cursor-pointer rounded-lg cursor-pointer transition-colors",
              ),
            ],
            [Icon.menu()],
          ),
          h.div(
            [],
            [
              h.p([h.Class("text-xs font-medium")], ["effect/slopcop"]),
              h.h1([h.Class("font-bold")], ["Overview"]),
            ],
          ),
        ],
      ),
      h.submodel({
        slotId: "theme-switcher",
        model: model.theme,
        view: Theme.view,
        toParentMessage: (message) => GotThemeMessage({ message }),
      }),
    ],
  )
