import type { Html, HtmlBuilder } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import { RequestedSetupRefresh, type Message } from "./message"
import type { Model } from "./model"

const actionClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm outline-hidden hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50"

const secondaryActionClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50"

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.main(
    [
      h.Class(
        "grid min-h-svh place-items-center bg-background px-6 py-12 text-foreground",
      ),
    ],
    [
      h.section(
        [
          h.Class(
            "w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm",
          ),
        ],
        [
          h.p(
            [
              h.Class(
                "font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary",
              ),
            ],
            [eyebrow(model)],
          ),
          h.h1(
            [h.Class("mt-3 text-3xl font-semibold tracking-tight sm:text-4xl")],
            [title(model)],
          ),
          h.p(
            [
              h.Class(
                "mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base",
              ),
            ],
            [description(model)],
          ),
          h.div([h.Class("mt-7 flex flex-wrap gap-3")], actions(h, model)),
          h.ol(
            [h.Class("mt-8 grid gap-3 border-t border-border pt-6 text-sm")],
            [
              setupStep(
                h,
                "01",
                "Authorize",
                "Install the GitHub App for the Effect organization.",
              ),
              setupStep(
                h,
                "02",
                "Select",
                "Choose at least one repository SlopCop may access.",
              ),
              setupStep(
                h,
                "03",
                "Synchronize",
                "Import repository access into SlopCop.",
              ),
            ],
          ),
        ],
      ),
    ],
  ),
)

const eyebrow = (model: Model): string => {
  switch (model._tag) {
    case "LoadingSetup":
      return "Checking setup"
    case "AppNotInstalled":
      return "GitHub connection required"
    case "NoRepositoriesSelected":
      return "Choose repositories"
    case "Synchronizing":
      return "Synchronizing GitHub"
    case "Ready":
      return "Setup complete"
    case "SynchronizationFailed":
    case "SetupRequestFailed":
      return "Setup needs attention"
  }
}

const title = (model: Model): string => {
  switch (model._tag) {
    case "LoadingSetup":
      return "Preparing repository access."
    case "AppNotInstalled":
      return "Connect Effect repositories."
    case "NoRepositoriesSelected":
      return "Give SlopCop somewhere to patrol."
    case "Synchronizing":
      return "Repository access is being synchronized."
    case "Ready":
      return "Repository setup is complete."
    case "SynchronizationFailed":
    case "SetupRequestFailed":
      return "SlopCop could not finish setup."
  }
}

const description = (model: Model): string => {
  switch (model._tag) {
    case "LoadingSetup":
      return "SlopCop is checking the GitHub App installation and repository access."
    case "AppNotInstalled":
      return "Install the SlopCop GitHub App for the Effect organization, then choose the repositories it may access."
    case "NoRepositoriesSelected":
      return "The GitHub App is installed, but it cannot access any repositories yet. Update the installation and select at least one repository."
    case "Synchronizing":
      return "GitHub has accepted the installation. SlopCop is importing the selected repositories."
    case "Ready":
      return "You can continue to the SlopCop dashboard."
    case "SynchronizationFailed":
    case "SetupRequestFailed":
      return model.message
  }
}

const actions = (
  h: HtmlBuilder<Message>,
  model: Model,
): ReadonlyArray<Html> => {
  switch (model._tag) {
    case "AppNotInstalled":
      return [
        h.a(
          [h.Href(model.installationUrl), h.Class(actionClass)],
          ["Connect repositories"],
        ),
        refreshButton(h, "Check again"),
      ]
    case "NoRepositoriesSelected":
      return [
        h.a(
          [h.Href(model.configurationUrl), h.Class(actionClass)],
          ["Select repositories"],
        ),
        refreshButton(h, "Check again"),
      ]
    case "SynchronizationFailed":
    case "SetupRequestFailed":
      return [refreshButton(h, "Retry sync")]
    case "Ready":
      return [refreshButton(h, "Refresh setup")]
    case "LoadingSetup":
    case "Synchronizing":
      return [
        h.div(
          [h.Class("h-2 w-48 overflow-hidden rounded-full bg-muted")],
          [
            h.div(
              [h.Class("h-full w-2/3 animate-pulse rounded-full bg-primary")],
              [],
            ),
          ],
        ),
      ]
  }
}

const refreshButton = (h: HtmlBuilder<Message>, label: string): Html =>
  h.button(
    [
      h.Type("button"),
      h.OnClick(RequestedSetupRefresh()),
      h.Class(secondaryActionClass),
    ],
    [label],
  )

const setupStep = (
  h: HtmlBuilder<Message>,
  number: string,
  heading: string,
  copy: string,
): Html =>
  h.li(
    [h.Class("grid grid-cols-[2.5rem_1fr] gap-3")],
    [
      h.span(
        [h.Class("font-mono text-xs font-semibold text-primary")],
        [number],
      ),
      h.div(
        [],
        [
          h.p([h.Class("font-medium")], [heading]),
          h.p([h.Class("mt-1 text-muted-foreground")], [copy]),
        ],
      ),
    ],
  )
