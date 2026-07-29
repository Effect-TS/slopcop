import type * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { Select } from "@foldkit/ui"
import * as DateTime from "effect/DateTime"
import { Submodel } from "foldkit"
import { type Html, html } from "foldkit/html"
import {
  ChangedActivityOperation,
  ChangedActivityRepository,
  type Message,
  RequestedActivity,
  RequestedMoreActivity,
} from "./message"
import type { Model } from "./model"

type Entry = typeof LabelingRuleManagement.PublicLabelingRuleActivityEntry.Type

const fieldLabelClass =
  "mb-2 block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)]"
const fieldClass =
  "w-full border border-[var(--line)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20"
const buttonClass =
  "border border-[var(--line)] bg-[var(--card)] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-[var(--blue)] hover:text-[var(--blue-dark)] disabled:cursor-wait disabled:opacity-50"

const slug = (entry: Entry) =>
  `${entry.repository.owner}/${entry.repository.repo}`

const label = (entry: Entry) =>
  entry.after?.label ?? entry.before?.label ?? entry.ruleId

const actor = (value: string) =>
  value.replace(/^admin:cloudflare-access:/, "").replace(/^system:/, "System: ")

const changedFields = (entry: Entry) => {
  if (entry.before === null || entry.after === null) return []
  const fields = [
    "label",
    "instructions",
    "mode",
    "exclusiveGroup",
    "enabled",
    "validationStatus",
    "validatedAt",
  ] as const
  return fields.filter(
    (field) => String(entry.before?.[field]) !== String(entry.after?.[field]),
  )
}

const activityRow = (entry: Entry): Html => {
  const h = html<Message>()
  const changes = changedFields(entry)
  return h.li(
    [
      h.Class(
        "border border-[var(--line)] bg-[var(--card)] p-5 shadow-[4px_4px_0_var(--shadow)]",
      ),
    ],
    [
      h.div(
        [
          h.Class(
            "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
          ),
        ],
        [
          h.div(
            [h.Class("min-w-0")],
            [
              h.div(
                [h.Class("flex flex-wrap items-center gap-2")],
                [
                  h.span(
                    [
                      h.Class(
                        "border border-[var(--line)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wider",
                      ),
                    ],
                    [entry.operation],
                  ),
                  h.span(
                    [
                      h.Class(
                        "font-mono text-sm font-black text-[var(--blue-dark)]",
                      ),
                    ],
                    [slug(entry)],
                  ),
                  h.span(
                    [h.Class("font-mono text-sm font-black")],
                    [label(entry)],
                  ),
                ],
              ),
              h.p(
                [h.Class("mt-2 text-xs text-[var(--muted-ink)]")],
                [`By ${actor(entry.actor)}`],
              ),
              ...(changes.length === 0
                ? []
                : [
                    h.p(
                      [h.Class("mt-2 text-xs")],
                      [`Changed: ${changes.join(", ")}`],
                    ),
                  ]),
            ],
          ),
          h.time(
            [h.Class("shrink-0 text-xs text-[var(--muted-ink)]")],
            [DateTime.toDate(entry.createdAt).toLocaleString()],
          ),
        ],
      ),
    ],
  )
}

export const view = Submodel.defineView<Model, Message>((model): Html => {
  const h = html<Message>()
  const entries =
    model.activity._tag === "Ready" || model.activity._tag === "LoadingMore"
      ? model.activity.entries
      : []
  const repositories = Array.from(
    new Set([
      ...model.repositories.map(
        (repository) => `${repository.owner}/${repository.repo}`,
      ),
      ...(model.repository === null ? [] : [model.repository]),
    ]),
  ).sort((left, right) => left.localeCompare(right))

  return h.main(
    [h.Class("mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10")],
    [
      h.header(
        [h.Class("border-b border-[var(--line)] pb-6")],
        [
          h.p(
            [
              h.Class(
                "font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--green-dark)]",
              ),
            ],
            ["Dispatch record"],
          ),
          h.h1([h.Class("mt-2 text-3xl font-black sm:text-4xl")], ["Activity"]),
          h.p(
            [
              h.Class(
                "mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]",
              ),
            ],
            ["Label-rule configuration changes across every repository."],
          ),
        ],
      ),
      h.div(
        [h.Class("mt-6 grid gap-4 sm:grid-cols-2")],
        [
          Select.view<Message>({
            id: "activity-repository",
            value: model.repository ?? "all",
            onChange: (repository) =>
              ChangedActivityRepository({
                repository: repository === "all" ? null : repository,
              }),
            toView: (attributes) =>
              h.div(
                [],
                [
                  h.label(
                    [...attributes.label, h.Class(fieldLabelClass)],
                    ["Repository"],
                  ),
                  h.select(
                    [...attributes.select, h.Class(fieldClass)],
                    [
                      h.option([h.Value("all")], ["All repositories"]),
                      ...repositories.map((repository) =>
                        h.option([h.Value(repository)], [repository]),
                      ),
                    ],
                  ),
                  h.p(
                    [...attributes.description, h.Class("sr-only")],
                    ["Filter activity by repository"],
                  ),
                ],
              ),
          }),
          Select.view<Message>({
            id: "activity-operation",
            value: model.operation,
            onChange: (operation) =>
              operation === "create" ||
              operation === "update" ||
              operation === "validate" ||
              operation === "disable" ||
              operation === "delete" ||
              operation === "all"
                ? ChangedActivityOperation({ operation })
                : ChangedActivityOperation({ operation: "all" }),
            toView: (attributes) =>
              h.div(
                [],
                [
                  h.label(
                    [...attributes.label, h.Class(fieldLabelClass)],
                    ["Operation"],
                  ),
                  h.select(
                    [...attributes.select, h.Class(fieldClass)],
                    [
                      h.option([h.Value("all")], ["All operations"]),
                      h.option([h.Value("create")], ["Created"]),
                      h.option([h.Value("update")], ["Updated"]),
                      h.option([h.Value("validate")], ["Validated"]),
                      h.option([h.Value("disable")], ["Disabled"]),
                      h.option([h.Value("delete")], ["Deleted"]),
                    ],
                  ),
                  h.p(
                    [...attributes.description, h.Class("sr-only")],
                    ["Filter activity by operation"],
                  ),
                ],
              ),
          }),
        ],
      ),
      h.div(
        [h.Class("mt-6")],
        [
          ...(model.loadMoreError === null
            ? []
            : [
                h.p(
                  [
                    h.Role("alert"),
                    h.Class(
                      "mb-4 border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm",
                    ),
                  ],
                  [model.loadMoreError],
                ),
              ]),
          ...(model.activity._tag === "NotAsked" ||
          model.activity._tag === "Loading"
            ? [
                h.div(
                  [h.AriaLabel("Loading activity"), h.Class("space-y-4")],
                  Array.from({ length: 4 }, (_, index) =>
                    h.div(
                      [
                        h.AriaHidden(true),
                        h.DataAttribute("activity-skeleton", String(index)),
                        h.Class(
                          "h-28 animate-pulse border border-[var(--line)] bg-[var(--card)] opacity-70",
                        ),
                      ],
                      [],
                    ),
                  ),
                ),
              ]
            : model.activity._tag === "Failed"
              ? [
                  h.section(
                    [
                      h.Class(
                        "border border-[var(--coral)] bg-[var(--coral-soft)] p-5",
                      ),
                    ],
                    [
                      h.p(
                        [h.Role("alert"), h.Class("text-sm")],
                        [model.activity.message],
                      ),
                      h.button(
                        [
                          h.Type("button"),
                          h.OnClick(RequestedActivity()),
                          h.Class(`${buttonClass} mt-3`),
                        ],
                        ["Try again"],
                      ),
                    ],
                  ),
                ]
              : entries.length === 0
                ? [
                    h.section(
                      [
                        h.Class(
                          "border border-dashed border-[var(--line)] bg-[var(--card)] px-6 py-14 text-center",
                        ),
                      ],
                      [
                        h.h2(
                          [h.Class("text-xl font-black")],
                          ["No activity matches these filters"],
                        ),
                        h.p(
                          [h.Class("mt-2 text-sm text-[var(--muted-ink)]")],
                          ["Seeded rules do not have creation audit records."],
                        ),
                      ],
                    ),
                  ]
                : [
                    h.ol([h.Class("space-y-4")], entries.map(activityRow)),
                    ...((model.activity._tag === "Ready" &&
                      model.activity.nextCursor !== null) ||
                    model.activity._tag === "LoadingMore"
                      ? [
                          h.div(
                            [h.Class("mt-5 text-center")],
                            [
                              h.button(
                                [
                                  h.Type("button"),
                                  h.OnClick(RequestedMoreActivity()),
                                  h.Disabled(
                                    model.activity._tag === "LoadingMore",
                                  ),
                                  h.Class(buttonClass),
                                ],
                                [
                                  model.activity._tag === "LoadingMore"
                                    ? "Loading..."
                                    : "Load more",
                                ],
                              ),
                            ],
                          ),
                        ]
                      : []),
                  ]),
        ],
      ),
    ],
  )
})
