import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"
import * as FoldkitCommand from "foldkit/command"
import * as Navigation from "foldkit/navigation"
import * as Runtime from "foldkit/runtime"
import * as Subscription from "foldkit/subscription"
import type { Document, HtmlBuilder } from "foldkit/html"
import { m } from "foldkit/message"
import { evo } from "foldkit/struct"
import * as Url from "foldkit/url"
import { ApiClient } from "./api-client"
import * as AppSidebar from "./components/app-sidebar/index"
import * as AutoLabeling from "./features/auto-labeling"
import * as Icon from "./features/icon"
import * as Setup from "./features/setup"
import * as RepositorySelector from "./components/repository-selector"
import * as Router from "./router"

// MODEL

export const Model = Schema.Struct({
  autoLabeling: AutoLabeling.Model,
  setup: Setup.Model,
  sidebar: AppSidebar.Model,
  route: Router.AppRoute,
})
export type Model = typeof Model.Type

// MESSAGE

export const ClickedLink = m("ClickedLink", {
  request: Navigation.UrlRequest,
})
export type ClickedLink = typeof ClickedLink.Type

export const ChangedUrl = m("ChangedUrl", { url: Url.Url })
export type ChangedUrl = typeof ChangedUrl.Type

export const CompletedLoadExternal = m("CompletedLoadExternal")
export type CompletedLoadExternal = typeof CompletedLoadExternal.Type

export const CompletedNavigateInternal = m("CompletedNavigateInternal")
export type CompletedNavigateInternal = typeof CompletedNavigateInternal.Type

export const GotSidebarMessage = m("GotSidebarMessage", {
  message: AppSidebar.Message,
})
export type GotSidebarMessage = typeof GotSidebarMessage.Type

export const GotSetupMessage = m("GotSetupMessage", {
  message: Setup.Message,
})
export type GotSetupMessage = typeof GotSetupMessage.Type

export const GotAutoLabelingMessage = m("GotAutoLabelingMessage", {
  message: AutoLabeling.Message,
})
export type GotAutoLabelingMessage = typeof GotAutoLabelingMessage.Type

export const Message = Schema.Union([
  ClickedLink,
  ChangedUrl,
  CompletedLoadExternal,
  CompletedNavigateInternal,
  GotAutoLabelingMessage,
  GotSidebarMessage,
  GotSetupMessage,
])
export type Message = typeof Message.Type

// COMMAND

export const NavigateInternal = FoldkitCommand.define("NavigateInternal", {
  args: { url: Schema.String },
  messages: [CompletedNavigateInternal],
  execute: ({ url }) =>
    Navigation.pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())),
})

export const LoadExternal = FoldkitCommand.define("LoadExternal", {
  args: { href: Schema.String },
  messages: [CompletedLoadExternal],
  execute: ({ href }) =>
    Navigation.load(href).pipe(Effect.as(CompletedLoadExternal())),
})

// UPDATE

type Command = FoldkitCommand.Command<Message, never, AppResources>

type UpdateReturn = readonly [Model, ReadonlyArray<Command>]

const mapSidebarCommands = (
  commands: ReadonlyArray<AppSidebar.Command>,
): ReadonlyArray<Command> =>
  FoldkitCommand.mapMessages(commands, (message) =>
    GotSidebarMessage({ message }),
  )

const mapSetupCommands = (
  commands: ReadonlyArray<Setup.Command>,
): ReadonlyArray<Command> =>
  FoldkitCommand.mapMessages(commands, (message) =>
    GotSetupMessage({ message }),
  )

const reloadRepositoryCommands = (): ReadonlyArray<Command> =>
  mapSidebarCommands(
    AppSidebar.mapRepositorySelectorCommands([
      RepositorySelector.LoadRepositories(),
    ]),
  )

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tags({
      ClickedLink: ({ request }) =>
        request._tag === "Internal"
          ? [model, [NavigateInternal({ url: Url.toString(request.url) })]]
          : [model, [LoadExternal({ href: request.href })]],

      ChangedUrl: ({ url }) => [
        evo(model, { route: () => Router.urlToAppRoute(url) }),
        [],
      ],

      CompletedLoadExternal: () => [model, []],
      CompletedNavigateInternal: () => [model, []],

      GotAutoLabelingMessage: ({ message: autoLabelingMessage }) => {
        const [autoLabeling] = AutoLabeling.update(
          model.autoLabeling,
          autoLabelingMessage,
        )
        return [evo(model, { autoLabeling: () => autoLabeling }), []]
      },

      GotSidebarMessage: ({ message: sidebarMessage }) => {
        const [sidebar, commands] = AppSidebar.update(
          model.sidebar,
          sidebarMessage,
        )
        return [
          evo(model, { sidebar: () => sidebar }),
          mapSidebarCommands(commands),
        ]
      },
      GotSetupMessage: ({ message: setupMessage }) => {
        const [setup, commands] = Setup.update(model.setup, setupMessage)
        return [
          evo(model, { setup: () => setup }),
          [
            ...mapSetupCommands(commands),
            ...(setup._tag === "Ready" ? reloadRepositoryCommands() : []),
          ],
        ]
      },
    }),
    Match.exhaustive,
  )

// FLAGS

export const Flags = Schema.Struct({
  sidebar: AppSidebar.Flags,
})
export type Flags = typeof Flags.Type

// INIT

export const flags = Effect.gen(function* () {
  const sidebar = yield* AppSidebar.flags

  return Flags.make({ sidebar }, { disableChecks: true })
})

export type AppResources = KeyValueStore.KeyValueStore | ApiClient

export const init: Runtime.RoutingApplicationInit<
  Model,
  Message,
  Flags,
  AppResources
> = (flags, url) => {
  const [sidebar, commands] = AppSidebar.init(flags.sidebar)
  const [setup, setupCommands] = Setup.init()

  return [
    {
      autoLabeling: AutoLabeling.init(),
      route: Router.urlToAppRoute(url),
      setup,
      sidebar,
    },
    [...mapSidebarCommands(commands), ...mapSetupCommands(setupCommands)],
  ]
}

// SUBSCRIPTIONS

const sidebarSubscriptions = Subscription.lift(AppSidebar.subscriptions)<
  Model,
  Message
>({
  toChildModel: (model) => model.sidebar,
  toParentMessage: (message) => GotSidebarMessage({ message }),
})

export const subscriptions = Subscription.aggregate<Model, Message>()(
  sidebarSubscriptions,
)

// VIEW

const navigationGroups: ReadonlyArray<AppSidebar.NavigationGroup> = [
  {
    label: "Patrol",
    items: [
      {
        value: "Root",
        label: "Overview",
        description: "Command center",
        icon: Icon.circleGauge(),
      },
      {
        value: "AutoLabeling",
        label: "Auto-Labeling",
        description: "Citation policies",
        icon: Icon.tags(),
      },
    ],
  },
]

const navigationHref = (value: AppSidebar.NavigationValue): string => {
  switch (value) {
    case "Root":
      return Router.rootRouter()
    case "AutoLabeling":
      return Router.autoLabelingRouter()
  }
}

const comingSoonView = (h: HtmlBuilder<Message>) =>
  h.section(
    [h.AriaLabelledBy("coming-soon-title"), h.Class("max-w-md text-center")],
    [
      h.p(
        [
          h.Class(
            "mb-3 font-mono text-xs font-medium uppercase tracking-widest text-primary",
          ),
        ],
        ["In progress"],
      ),
      h.h2(
        [h.Id("coming-soon-title"), h.Class("text-2xl font-semibold")],
        ["Coming soon"],
      ),
      h.p(
        [h.Class("mt-2 text-sm leading-relaxed text-muted-foreground")],
        ["This part of SlopCop is still under construction."],
      ),
    ],
  )

const routeView = (model: Model, h: HtmlBuilder<Message>) => {
  switch (model.route._tag) {
    case "AutoLabeling":
      return h.submodel({
        slotId: "auto-labeling",
        model: model.autoLabeling,
        view: AutoLabeling.view,
        toParentMessage: (message) => GotAutoLabelingMessage({ message }),
      })
    case "Root":
    case "NotFound":
      return comingSoonView(h)
  }
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title:
    model.setup._tag === "Ready" ? "SlopCop" : "Connect repositories | SlopCop",
  body:
    model.setup._tag === "Ready"
      ? h.submodel({
          slotId: "app-sidebar",
          model: model.sidebar,
          view: AppSidebar.view,
          viewInputs: {
            navigationGroups,
            pageTitle:
              model.route._tag === "AutoLabeling"
                ? "Auto-Labeling"
                : "Overview",
            toNavigationHref: navigationHref,
            isNavigationItemCurrent: (value) => model.route._tag === value,
            toView: (_) => routeView(model, h),
          },
          toParentMessage: (message) => GotSidebarMessage({ message }),
        })
      : h.submodel({
          slotId: "setup",
          model: model.setup,
          view: Setup.view,
          toParentMessage: (message) => GotSetupMessage({ message }),
        }),
})
