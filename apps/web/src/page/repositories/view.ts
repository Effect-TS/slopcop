import type * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Input, Switch } from "@foldkit/ui"
import { Submodel } from "foldkit"
import { type Html, html } from "foldkit/html"

import {
  ChangedRepositoryQuery,
  type Message,
  RequestedRepositories,
  ToggledRepositoryPatrol,
} from "./message"
import type { Model, RepositoriesState } from "./model"
import { repositoryWorkspaceRouter } from "../../route"

const repositoryKey = (repository: RepositoryManagement.RepositoryPath) =>
  `${repository.owner}/${repository.repo}`

const isPending = (
  state: Extract<RepositoriesState, { readonly _tag: "Ready" }>,
  repository: RepositoryManagement.RepositoryPath,
) =>
  state.pendingPatrols.some(
    (pending) =>
      pending.owner === repository.owner && pending.repo === repository.repo,
  )

const patrolSwitch = (
  repository: RepositoryManagement.RepositorySummary,
  pending: boolean,
): Html => {
  const h = html<Message>()
  const slug = repositoryKey(repository)

  return Switch.view<Message>({
    id: `patrol-${repository.owner}-${repository.repo}`,
    isChecked: repository.enabled,
    isDisabled: pending,
    onToggle: (enabled) =>
      ToggledRepositoryPatrol({
        owner: repository.owner,
        repo: repository.repo,
        enabled,
      }),
    toView: (attributes) =>
      h.div(
        [h.Class("flex items-center gap-3")],
        [
          h.div(
            [h.Class("text-right")],
            [
              h.p(
                [
                  ...attributes.label,
                  h.Class(
                    "font-mono text-[10px] font-bold uppercase tracking-wider",
                  ),
                ],
                [
                  pending
                    ? "Updating"
                    : repository.enabled
                      ? "On duty"
                      : "Standing by",
                ],
              ),
              h.p(
                [...attributes.description, h.Class("sr-only")],
                [`Toggle patrol for ${slug}`],
              ),
            ],
          ),
          h.button(
            [
              ...attributes.button,
              h.Class(
                "relative h-6 w-11 border border-white/30 bg-black/20 transition-colors data-[checked]:border-[var(--green)] data-[checked]:bg-[var(--green)] data-[disabled]:cursor-wait data-[disabled]:opacity-60",
              ),
            ],
            [
              h.span(
                [
                  h.AriaHidden(true),
                  h.Class(
                    "absolute left-0.5 top-0.5 size-[18px] bg-white shadow-sm transition-transform data-[checked]:translate-x-5",
                  ),
                  ...(repository.enabled
                    ? [h.DataAttribute("checked", "")]
                    : []),
                ],
                [],
              ),
            ],
          ),
        ],
      ),
  })
}

const repositoryCard = (
  state: Extract<RepositoriesState, { readonly _tag: "Ready" }>,
  repository: RepositoryManagement.RepositorySummary,
): Html => {
  const h = html<Message>()
  const pending = isPending(state, repository)

  return h.article(
    [
      h.Class(
        "group flex min-h-56 flex-col border border-[var(--line)] bg-[var(--card)] shadow-[5px_5px_0_var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--blue)] hover:shadow-[7px_7px_0_var(--shadow)]",
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
            [h.Class("min-w-0")],
            [
              h.p(
                [
                  h.Class(
                    "font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-ink)]",
                  ),
                ],
                [repository.owner],
              ),
              h.h2(
                [h.Class("mt-1 truncate font-mono text-base font-black")],
                [
                  h.a(
                    [
                      h.Href(
                        repositoryWorkspaceRouter({
                          owner: repository.owner,
                          repo: repository.repo,
                        }),
                      ),
                      h.Class("hover:text-[var(--blue-dark)] hover:underline"),
                    ],
                    [repository.repo],
                  ),
                ],
              ),
            ],
          ),
          patrolSwitch(repository, pending),
        ],
      ),
      h.div(
        [h.Class("flex flex-1 flex-col justify-between gap-5 p-5")],
        [
          h.div(
            [h.Class("flex flex-wrap gap-2")],
            [
              h.span(
                [
                  h.Class(
                    repository.enabled
                      ? "border border-[var(--green)] bg-[var(--green-soft)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--green-dark)]"
                      : "border border-[var(--line)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)]",
                  ),
                ],
                [repository.enabled ? "Patrol active" : "Patrol paused"],
              ),
              h.span(
                [
                  h.Class(
                    "border border-[var(--line)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)]",
                  ),
                ],
                ["GitHub connected"],
              ),
            ],
          ),
          h.a(
            [
              h.Href(
                repositoryWorkspaceRouter({
                  owner: repository.owner,
                  repo: repository.repo,
                }),
              ),
              h.Class(
                "block border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-center font-mono text-xs font-bold uppercase tracking-wider transition hover:border-[var(--blue)] hover:bg-[var(--blue)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]",
              ),
            ],
            ["Open workspace"],
          ),
        ],
      ),
    ],
  )
}

const loadingView = (): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.AriaLabel("Loading repositories"),
      h.Class("grid gap-4 md:grid-cols-2 xl:grid-cols-3"),
    ],
    Array.from({ length: 6 }, (_, index) =>
      h.div(
        [
          h.AriaHidden(true),
          h.Class(
            "h-56 animate-pulse border border-[var(--line)] bg-[var(--card)] opacity-70",
          ),
          h.DataAttribute("skeleton", String(index)),
        ],
        [],
      ),
    ),
  )
}

const emptyView = (query: string): Html => {
  const h = html<Message>()
  const hasQuery = query.trim().length > 0
  return h.section(
    [
      h.Class(
        "border border-dashed border-[var(--line)] bg-[var(--card)] px-6 py-16 text-center",
      ),
    ],
    [
      h.p(
        [
          h.Class(
            "font-mono text-xs font-bold uppercase tracking-[0.2em] text-[var(--blue-dark)]",
          ),
        ],
        [hasQuery ? "No matching files" : "No repositories installed"],
      ),
      h.h2(
        [h.Class("mt-3 text-2xl font-black")],
        [
          hasQuery
            ? `No repositories match "${query}".`
            : "The repository desk is empty.",
        ],
      ),
      h.p(
        [
          h.Class(
            "mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted-ink)]",
          ),
        ],
        [
          hasQuery
            ? "Try a repository owner or a shorter name."
            : "Install the SlopCop GitHub App on a repository to begin patrol.",
        ],
      ),
    ],
  )
}

const repositoryList = (model: Model): Html => {
  const h = html<Message>()
  const state = model.repositories

  if (state._tag === "NotAsked" || state._tag === "Loading") {
    return loadingView()
  }
  if (state._tag === "Failed") {
    return h.section(
      [h.Class("border border-[var(--coral)] bg-[var(--coral-soft)] p-6")],
      [
        h.p(
          [
            h.Class(
              "font-mono text-xs font-black uppercase tracking-wider text-[var(--coral-dark)]",
            ),
          ],
          ["Repository request failed"],
        ),
        h.p([h.Class("mt-2 text-sm text-[var(--muted-ink)]")], [state.message]),
        h.button(
          [
            h.OnClick(RequestedRepositories()),
            h.Class(
              "mt-5 border border-[var(--coral)] bg-[var(--card)] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider hover:bg-[var(--coral)] hover:text-white",
            ),
          ],
          ["Try again"],
        ),
      ],
    )
  }

  const query = model.query.trim().toLocaleLowerCase()
  const repositories = state.repositories.filter((repository) =>
    repositoryKey(repository).toLocaleLowerCase().includes(query),
  )

  if (repositories.length === 0) return emptyView(model.query)

  return h.div(
    [h.Class("grid gap-4 md:grid-cols-2 xl:grid-cols-3")],
    repositories.map((repository) => repositoryCard(state, repository)),
  )
}

export const view = Submodel.defineView<Model, Message>((model): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-10",
      ),
    ],
    [
      h.header(
        [
          h.Class(
            "flex flex-col gap-3 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between",
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
                ["GitHub App installations"],
              ),
              h.h1(
                [
                  h.Class(
                    "mt-2 text-3xl font-black tracking-tight sm:text-4xl",
                  ),
                ],
                ["Repositories"],
              ),
              h.p(
                [
                  h.Class(
                    "mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)] sm:text-base",
                  ),
                ],
                [
                  "Control where SlopCop patrols and open a repository workspace to manage its automation.",
                ],
              ),
            ],
          ),
        ],
      ),
      Input.view<Message>({
        id: "repository-search",
        value: model.query,
        placeholder: "Search owner or repository...",
        onInput: (query) => ChangedRepositoryQuery({ query }),
        toView: (attributes) =>
          h.div(
            [h.Class("max-w-md")],
            [
              h.label(
                [
                  ...attributes.label,
                  h.Class(
                    "mb-2 block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)]",
                  ),
                ],
                ["Search repositories"],
              ),
              h.input([
                ...attributes.input,
                h.Autocomplete("off"),
                h.Class(
                  "w-full border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm outline-none placeholder:text-[var(--muted-ink)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20",
                ),
              ]),
              h.p(
                [...attributes.description, h.Class("sr-only")],
                ["Filter repositories by owner or name"],
              ),
            ],
          ),
      }),
      model.patrolNotice._tag === "PatrolUpdateFailed"
        ? h.div(
            [
              h.AriaLive("polite"),
              h.Class(
                "border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm",
              ),
            ],
            [
              h.span(
                [h.Class("font-bold")],
                [`${repositoryKey(model.patrolNotice.repository)}: `],
              ),
              model.patrolNotice.message,
            ],
          )
        : h.div([], []),
      repositoryList(model),
    ],
  )
})
