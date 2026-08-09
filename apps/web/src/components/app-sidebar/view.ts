import * as Sidebar from "@slopcop/ui/Sidebar"
import * as Option from "effect/Option"
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
import type * as Router from "../../router"

export interface RenderInfo {
  readonly trigger: ReadonlyArray<ChildAttribute>
}

export type NavigationValue = Exclude<Router.AppRoute["_tag"], "NotFound">

export type NavigationItem = Readonly<{
  value: NavigationValue
  label: string
  description: string
  icon: Html
}>

export type NavigationGroup = Readonly<{
  label: string
  items: ReadonlyArray<NavigationItem>
}>

export type NavigationConfig = Readonly<{
  groups: ReadonlyArray<NavigationGroup>
  toHref: (value: NavigationValue) => string
  isItemCurrent: (value: NavigationValue) => boolean
}>

export type ViewInputs = Readonly<{
  navigationGroups: ReadonlyArray<NavigationGroup>
  pageTitle: string
  toNavigationHref: (value: NavigationValue) => string
  isNavigationItemCurrent: (value: NavigationValue) => boolean
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
  {
    button,
    isNavigationItemCurrent,
    isCollapsed,
    layout,
    navigationGroups,
    pageTitle,
    panel,
    toNavigationHref,
    toView,
  }: DesktopSidebarProps,
): Html => {
  const content = toView({ trigger: button })

  const main = sidebarMain(h, model, {
    content,
    pageTitle,
    sidebarTrigger: button,
  })

  const aside = sidebarAside(h, model, isCollapsed, {
    groups: navigationGroups,
    toHref: toNavigationHref,
    isItemCurrent: isNavigationItemCurrent,
  })

  return h.div(
    [...layout, h.Class("flex min-h-svh")],
    [
      h.aside(
        [
          ...panel,
          ...(isCollapsed ? [h.DataAttribute("collapsed", "")] : []),
          h.Class(
            `group/sidebar sticky top-0 shrink-0 flex flex-col h-svh bg-sidebar border-r border-sidebar-border text-white overflow-hidden transition-[width] duration-200 ${isCollapsed ? "w-18" : "w-64"}`,
          ),
        ],
        [aside],
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
    isNavigationItemCurrent,
    isCollapsed,
    isVisible,
    layout,
    navigationGroups,
    pageTitle,
    panel,
    title,
    toNavigationHref,
    toView,
  }: MobileSidebarProps,
): Html => {
  const content = toView({ trigger: button })
  const main = sidebarMain(h, model, {
    content,
    pageTitle,
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
                      "fixed inset-0 bg-black/60 data-closed:opacity-0 data-transition:transition-opacity data-transition:duration-200",
                    ),
                  ],
                  [],
                ),
                h.aside(
                  [
                    ...panel,
                    h.Class(
                      "fixed inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl data-closed:-translate-x-full data-transition:transition-transform data-transition:duration-200",
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
                    sidebarAside(h, model, isCollapsed, {
                      groups: navigationGroups,
                      toHref: toNavigationHref,
                      isItemCurrent: isNavigationItemCurrent,
                    }),
                  ],
                ),
              ]
            : []),
        ],
      ),
    ],
  )
}

const sidebarMain = (
  h: HtmlBuilder<Message>,
  model: Model,
  {
    content,
    pageTitle,
    sidebarTrigger,
  }: {
    readonly content: Html
    readonly pageTitle: string
    readonly sidebarTrigger: ReadonlyArray<ChildAttribute>
  },
): Html =>
  h.main(
    [h.Class("min-w-0 flex-1 bg-background text-foreground")],
    [
      mainHeader(h, model, { pageTitle, sidebarTrigger }),
      h.div(
        [h.Class("grid min-h-[calc(100svh-4rem)] place-items-center p-6")],
        [content],
      ),
    ],
  )

const sidebarAside = (
  h: HtmlBuilder<Message>,
  model: Model,
  isCollapsed: boolean,
  navigation: NavigationConfig,
): Html => {
  const header = sidebarHeader(h, model, isCollapsed)

  const content = sidebarContent(h, navigation)

  return h.div(
    [h.Class("flex h-full w-full shrink-0 flex-col")],
    [header, content],
  )
}

const sidebarHeader = (
  h: HtmlBuilder<Message>,
  model: Model,
  isCollapsed: boolean,
): Html => {
  const repositorySelector = h.submodel({
    slotId: "repository-selector",
    model: model.repositorySelector,
    view: RepositorySelector.view,
    toParentMessage: (message) => GotRepositorySelectorMessage({ message }),
  })

  return ih.div(
    [
      ih.Class(
        `flex flex-col p-2 gap-3 ${isCollapsed ? "**:data-repository-selector:justify-center" : ""}`,
      ),
    ],
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
      repositorySelector,
    ],
  )
}

const sidebarContent = (
  h: HtmlBuilder<Message>,
  navigation: NavigationConfig,
): Html =>
  h.div(
    [h.Class("min-h-0 flex-1 flex flex-col overflow-auto no-scrollbar")],
    navigation.groups.map((group) => sidebarGroup(h, group, navigation)),
  )

const sidebarGroup = (
  h: HtmlBuilder<Message>,
  group: NavigationGroup,
  navigation: NavigationConfig,
): Html =>
  h.nav(
    [
      h.AriaLabel(group.label),
      h.Class("relative w-full min-w-0 flex flex-col p-2"),
    ],
    [
      h.div(
        [
          h.Class(
            "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-collapsed/sidebar:-mt-8 group-data-collapsed/sidebar:opacity-0 focus-visible:ring-2 [&>svg]:size-4",
          ),
        ],
        [group.label],
      ),
      sidebarGroupContent(h, group.items, navigation),
    ],
  )

const sidebarGroupContent = (
  h: HtmlBuilder<Message>,
  items: ReadonlyArray<NavigationItem>,
  navigation: NavigationConfig,
): Html =>
  h.div(
    [h.Class("w-full text-sm")],
    [
      h.ul(
        [h.Class("flex w-full min-w-0 flex-col gap-1")],
        items.map((item) => sidebarNavigationItem(h, item, navigation)),
      ),
    ],
  )

const sidebarNavigationItem = (
  h: HtmlBuilder<Message>,
  item: NavigationItem,
  navigation: NavigationConfig,
): Html => {
  const isCurrent = navigation.isItemCurrent(item.value)

  return h.li(
    [h.Class("group/menu-item relative")],
    [
      h.a(
        [
          h.Href(navigation.toHref(item.value)),
          ...(isCurrent
            ? [h.AriaCurrent("page"), h.DataAttribute("current", "")]
            : []),
          h.Class(
            "peer/menu-button group/menu-button flex w-full h-auto items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-sm ring-sidebar-ring outline-hidden cursor-pointer transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-collapsed/sidebar:mx-auto group-data-collapsed/sidebar:size-8! focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-current:font-medium [&_svg]:shrink-0 [&>span:last-child]:truncate hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          ),
        ],
        [
          item.icon,
          h.span(
            [h.Class("flex min-w-0 flex-col")],
            [
              h.span([h.Class("truncate text-sm leading-tight")], [item.label]),
              h.span(
                [
                  h.Class(
                    "truncate text-[10.5px] leading-tight text-muted-foreground",
                  ),
                ],
                [item.description],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

const mainHeader = (
  h: HtmlBuilder<Message>,
  model: Model,
  {
    pageTitle,
    sidebarTrigger,
  }: {
    readonly pageTitle: string
    readonly sidebarTrigger: ReadonlyArray<ChildAttribute>
  },
): Html => {
  const repository = Option.match(
    RepositorySelector.selectedRepository(model.repositorySelector),
    {
      onNone: () => "No repository selected",
      onSome: RepositorySelector.repositoryValue,
    },
  )

  return h.header(
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
                "px-3 py-2 bg-card hover:bg-muted dark:hover:bg-input/50 border border-border focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg cursor-pointer transition-colors",
              ),
            ],
            [Icon.menu()],
          ),
          h.div(
            [],
            [
              h.p([h.Class("text-xs font-medium")], [repository]),
              h.h1([h.Class("font-bold")], [pageTitle]),
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
}
