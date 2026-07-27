import { type Document, type Html, html } from "foldkit/html"

import type { Message } from "./message"
import type { Model } from "./model"
import { repositoriesRouter } from "./route"
import { repositoriesView } from "./views/repositories"
import { shellView } from "./views/shell"

const stubView = (
  eyebrow: string,
  title: string,
  description: string,
): Html => {
  const h = html<Message>()
  return h.section(
    [h.Class("mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20")],
    [
      h.p(
        [
          h.Class(
            "font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--green-dark)]",
          ),
        ],
        [eyebrow],
      ),
      h.h1(
        [
          h.Class(
            "mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl",
          ),
        ],
        [title],
      ),
      h.p(
        [h.Class("mt-5 max-w-2xl text-base leading-7 text-[var(--muted-ink)]")],
        [description],
      ),
      h.div(
        [
          h.Class(
            "mt-10 border border-[var(--line)] bg-[var(--card)] p-6 shadow-[7px_7px_0_var(--shadow)]",
          ),
        ],
        [
          h.p(
            [h.Class("font-mono text-xs font-black uppercase tracking-widest")],
            ["Desk status"],
          ),
          h.p(
            [h.Class("mt-3 text-sm text-[var(--muted-ink)]")],
            [
              "This station is stubbed while the repositories directory is brought online.",
            ],
          ),
        ],
      ),
    ],
  )
}

const routeView = (model: Model): Html => {
  const h = html<Message>()
  switch (model.route._tag) {
    case "Dashboard":
      return stubView(
        "Watch tower",
        "Repository automation, under control.",
        "Monitor SlopCop operations across your GitHub App installations from one dispatch console.",
      )
    case "Repositories":
      return repositoriesView(model)
    case "RepositoryWorkspace":
      return h.section(
        [h.Class("mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8")],
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
          h.p(
            [
              h.Class(
                "mt-8 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--green-dark)]",
              ),
            ],
            ["Repository workspace"],
          ),
          h.h1(
            [
              h.Class(
                "mt-2 break-all font-mono text-3xl font-black sm:text-4xl",
              ),
            ],
            [`${model.route.owner}/${model.route.repo}`],
          ),
          h.div(
            [
              h.Class(
                "mt-8 border border-[var(--line)] bg-[var(--card)] p-6 shadow-[7px_7px_0_var(--shadow)]",
              ),
            ],
            [
              h.h2([h.Class("text-xl font-black")], ["Workspace coming next"]),
              h.p(
                [h.Class("mt-2 text-sm leading-6 text-[var(--muted-ink)]")],
                [
                  "Summary, labeling, decisions, events, audit, and settings will live here.",
                ],
              ),
            ],
          ),
        ],
      )
    case "Activity":
      return stubView(
        "Dispatch log",
        "Activity",
        "A chronological feed of labeling decisions and repository events.",
      )
    case "Reviews":
      return stubView(
        "Preview",
        "Reviews",
        "Review automation and provenance will be available here.",
      )
    case "SlopDetection":
      return stubView(
        "Preview",
        "Slop detection",
        "Detection policies and findings will be available here.",
      )
    case "Commands":
      return stubView(
        "Coming soon",
        "Commands",
        "Repository command workflows will be available here.",
      )
    case "Settings":
      return stubView(
        "Control desk",
        "Settings",
        "Organization and account controls will be available here.",
      )
    case "NotFound":
      return stubView(
        "404",
        "Page not found",
        `No dashboard station exists at ${model.route.path}.`,
      )
  }
}

export const view = (model: Model): Document => ({
  title: `${model.route._tag === "Dashboard" ? "Overview" : model.route._tag} | SlopCop`,
  body: shellView(model, routeView(model)),
})
