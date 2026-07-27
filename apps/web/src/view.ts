import { type Document, type Html, html } from "foldkit/html"

import { ClickedLogout, type Message } from "./message"
import type { Model } from "./model"

const brand = (): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class("flex items-center gap-3")],
    [
      h.div(
        [
          h.AriaHidden(true),
          h.Class(
            "grid size-10 place-items-center border-2 border-[var(--blue)] bg-[var(--ink)] font-mono text-sm font-black text-[var(--blue-light)] [clip-path:polygon(50%_0,100%_14%,92%_76%,50%_100%,8%_76%,0_14%)]",
          ),
        ],
        ["SC"],
      ),
      h.div(
        [],
        [
          h.p(
            [h.Class("font-mono text-lg font-black tracking-tight")],
            ["SLOP", h.span([h.Class("text-[var(--blue)]")], ["COP"])],
          ),
          h.p(
            [
              h.Class(
                "text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-ink)]",
              ),
            ],
            ["Repository operations"],
          ),
        ],
      ),
    ],
  )
}

const statusRow = (label: string, value: string): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        "grid gap-1 border-b border-[var(--line)] px-5 py-4 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-4",
      ),
    ],
    [
      h.p(
        [h.Class("font-mono text-xs font-bold uppercase tracking-wider")],
        [label],
      ),
      h.p([h.Class("text-sm text-[var(--muted-ink)]")], [value]),
    ],
  )
}

export const view = (_model: Model): Document => {
  const h = html<Message>()
  return {
    title: "Dashboard | SlopCop",
    body: h.main(
      [
        h.Class(
          "records-texture min-h-svh bg-[var(--khaki)] px-5 py-8 sm:px-8 lg:px-12 lg:py-10",
        ),
      ],
      [
        h.div(
          [h.Class("mx-auto max-w-5xl")],
          [
            h.header(
              [h.Class("flex items-center justify-between gap-6")],
              [
                brand(),
                h.button(
                  [
                    h.OnClick(ClickedLogout()),
                    h.Class(
                      "border border-[var(--line)] bg-[var(--paper)] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider hover:border-[var(--blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]",
                    ),
                  ],
                  ["Sign out"],
                ),
              ],
            ),
            h.section(
              [h.Class("py-16 sm:py-24")],
              [
                h.p(
                  [
                    h.Class(
                      "font-mono text-xs font-bold uppercase tracking-[0.22em] text-[var(--green-dark)]",
                    ),
                  ],
                  ["Access verified / Effectful-Tech"],
                ),
                h.h1(
                  [
                    h.Class(
                      "mt-4 max-w-3xl text-4xl font-black leading-[1.03] tracking-tight sm:text-6xl",
                    ),
                  ],
                  ["Repository automation, under control."],
                ),
                h.p(
                  [
                    h.Class(
                      "mt-6 max-w-2xl text-base leading-7 text-[var(--muted-ink)] sm:text-lg",
                    ),
                  ],
                  [
                    "Cloudflare Access confirmed your Effectful-Tech membership. You can administer SlopCop for every repository attached to the GitHub App.",
                  ],
                ),
              ],
            ),
            h.section(
              [
                h.AriaLabel("Security status"),
                h.Class(
                  "border border-black/15 bg-[var(--paper)] shadow-[8px_8px_0_rgba(45,38,30,0.08)]",
                ),
              ],
              [
                h.div(
                  [h.Class("border-b border-[var(--line)] px-5 py-4")],
                  [
                    h.h2(
                      [
                        h.Class(
                          "font-mono text-sm font-black uppercase tracking-widest",
                        ),
                      ],
                      ["Control desk"],
                    ),
                  ],
                ),
                statusRow("Identity", "Cloudflare Access"),
                statusRow(
                  "Authorization",
                  "Effectful-Tech organization member",
                ),
                statusRow("Repository scope", "GitHub App installations"),
                statusRow("API exposure", "Private service binding"),
              ],
            ),
          ],
        ),
      ],
    ),
  }
}
