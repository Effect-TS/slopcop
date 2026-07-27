import { Submodel } from "foldkit"
import { type Html, html } from "foldkit/html"

import type { AppRoute } from "../../route"
import {
  activityRouter,
  commandsRouter,
  dashboardRouter,
  repositoriesRouter,
  reviewsRouter,
  settingsRouter,
  slopDetectionRouter,
} from "../../route"
import { ClickedLogout, type Message, ToggledSidebar } from "./message"
import type { Model } from "./model"

export type ViewInputs = Readonly<{
  route: AppRoute
  content: () => Html
}>

const brand = (): Html => {
  const h = html<Message>()
  return h.a(
    [h.Href(dashboardRouter()), h.Class("flex items-center gap-3 px-2")],
    [
      h.div(
        [
          h.AriaHidden(true),
          h.Class(
            "grid size-10 place-items-center border-2 border-[var(--blue)] bg-[var(--sidebar-deep)] font-mono text-xs font-black text-[var(--blue-light)] [clip-path:polygon(50%_0,100%_14%,92%_76%,50%_100%,8%_76%,0_14%)]",
          ),
        ],
        ["SC"],
      ),
      h.div(
        [],
        [
          h.p(
            [
              h.Class(
                "font-mono text-base font-black tracking-tight text-white",
              ),
            ],
            ["SLOP", h.span([h.Class("text-[var(--blue-light)]")], ["COP"])],
          ),
          h.p(
            [
              h.Class(
                "text-[9px] font-bold uppercase tracking-[0.2em] text-white/55",
              ),
            ],
            ["Dispatch console"],
          ),
        ],
      ),
    ],
  )
}

const navItems = [
  { tag: "Dashboard", label: "Overview", href: dashboardRouter(), status: "" },
  {
    tag: "Repositories",
    label: "Repositories",
    href: repositoriesRouter(),
    status: "",
  },
  { tag: "Activity", label: "Activity", href: activityRouter(), status: "" },
  {
    tag: "Reviews",
    label: "Reviews",
    href: reviewsRouter(),
    status: "Preview",
  },
  {
    tag: "SlopDetection",
    label: "Slop detection",
    href: slopDetectionRouter(),
    status: "Preview",
  },
  {
    tag: "Commands",
    label: "Commands",
    href: commandsRouter(),
    status: "Soon",
  },
  { tag: "Settings", label: "Settings", href: settingsRouter(), status: "" },
] as const

const sidebar = (model: Model, route: AppRoute): Html => {
  const h = html<Message>()
  const repositoriesActive = route._tag === "RepositoryWorkspace"

  return h.aside(
    [
      h.Class(
        `fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-white/10 bg-[var(--sidebar)] text-white transition-transform md:translate-x-0 ${model.isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`,
      ),
    ],
    [
      h.div([h.Class("border-b border-white/10 px-4 py-5")], [brand()]),
      h.div(
        [h.Class("border-b border-white/10 p-4")],
        [
          h.a(
            [
              h.Href(repositoriesRouter()),
              h.Class(
                "block border border-white/15 bg-white/5 px-3 py-3 transition hover:border-[var(--blue-light)] hover:bg-white/10",
              ),
            ],
            [
              h.p(
                [
                  h.Class(
                    "text-[9px] font-bold uppercase tracking-[0.18em] text-white/45",
                  ),
                ],
                ["Repository desk"],
              ),
              h.p(
                [h.Class("mt-1 font-mono text-xs font-bold")],
                ["Browse installations"],
              ),
            ],
          ),
        ],
      ),
      h.nav(
        [
          h.AriaLabel("Primary navigation"),
          h.Class("flex-1 overflow-y-auto p-4"),
        ],
        [
          h.p(
            [
              h.Class(
                "px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40",
              ),
            ],
            ["Department"],
          ),
          h.ul(
            [h.Class("space-y-1")],
            navItems.map((item) => {
              const active =
                route._tag === item.tag ||
                (item.tag === "Repositories" && repositoriesActive)
              return h.li(
                [],
                [
                  h.a(
                    [
                      h.Href(item.href),
                      h.Class(
                        `flex items-center gap-3 px-3 py-2.5 text-sm transition ${active ? "bg-[var(--blue)] font-bold text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`,
                      ),
                      ...(active ? [h.DataAttribute("active", "")] : []),
                    ],
                    [
                      h.span(
                        [h.AriaHidden(true), h.Class("size-1.5 bg-current")],
                        [],
                      ),
                      h.span([h.Class("flex-1")], [item.label]),
                      ...(item.status
                        ? [
                            h.span(
                              [
                                h.Class(
                                  "border border-white/20 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-white/55",
                                ),
                              ],
                              [item.status],
                            ),
                          ]
                        : []),
                    ],
                  ),
                ],
              )
            }),
          ),
        ],
      ),
      h.div(
        [
          h.Class(
            "border-t border-white/10 px-7 py-5 font-mono text-[9px] uppercase leading-5 tracking-wider text-white/35",
          ),
        ],
        ["SlopCop / Repository division"],
      ),
    ],
  )
}

const routeTitle = (route: AppRoute): string => {
  switch (route._tag) {
    case "Dashboard":
      return "Overview"
    case "Repositories":
      return "Repositories"
    case "RepositoryWorkspace":
      return `${route.owner}/${route.repo}`
    case "Activity":
      return "Activity"
    case "Reviews":
      return "Reviews"
    case "SlopDetection":
      return "Slop detection"
    case "Commands":
      return "Commands"
    case "Settings":
      return "Settings"
    case "NotFound":
      return "Not found"
  }
}

export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, { route, content }): Html => {
    const h = html<Message>()
    return h.div(
      [
        h.Class(
          "records-texture relative min-h-svh bg-[var(--paper)] text-[var(--ink)]",
        ),
      ],
      [
        sidebar(model, route),
        ...(model.isSidebarOpen
          ? [
              h.button(
                [
                  h.OnClick(ToggledSidebar()),
                  h.AriaLabel("Close navigation"),
                  h.Class("fixed inset-0 z-20 bg-black/45 md:hidden"),
                ],
                [],
              ),
            ]
          : []),
        h.div(
          [h.Class("min-h-svh min-w-0 md:pl-72")],
          [
            h.header(
              [
                h.Class(
                  "sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[var(--line)] bg-[var(--paper)]/95 px-3 backdrop-blur sm:px-5",
                ),
              ],
              [
                h.button(
                  [
                    h.OnClick(ToggledSidebar()),
                    h.AriaLabel("Open navigation"),
                    h.Class(
                      "grid size-9 place-items-center border border-[var(--line)] bg-[var(--card)] font-mono text-lg md:hidden",
                    ),
                  ],
                  ["="],
                ),
                h.p(
                  [
                    h.Class(
                      "truncate font-mono text-xs font-black uppercase tracking-wider",
                    ),
                  ],
                  [routeTitle(route)],
                ),
                h.div(
                  [h.Class("ml-auto")],
                  [
                    h.button(
                      [
                        h.OnClick(ClickedLogout()),
                        h.Class(
                          "border border-[var(--line)] bg-[var(--card)] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-[var(--blue)]",
                        ),
                      ],
                      ["Sign out"],
                    ),
                  ],
                ),
              ],
            ),
            h.main([], [content()]),
          ],
        ),
      ],
    )
  },
)
