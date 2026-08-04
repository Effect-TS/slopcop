import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"
import * as FoldkitCommand from "foldkit/command"
import * as Runtime from "foldkit/runtime"
import * as Subscription from "foldkit/subscription"
import type { Document, HtmlBuilder } from "foldkit/html"
import { m } from "foldkit/message"
import { evo } from "foldkit/struct"
import { ApiClient } from "./api-client"
import * as AppSidebar from "./components/app-sidebar/index"
import * as Setup from "./features/setup"
import * as Theme from "./features/theme"
import * as RepositorySelector from "./components/repository-selector"

// MODEL

export const Model = Schema.Struct({
  count: Schema.Finite,
  setup: Setup.Model,
  sidebar: AppSidebar.Model,
})
export type Model = typeof Model.Type

// MESSAGE

export const ClickedDecrement = m("ClickedDecrement")
export const ClickedIncrement = m("ClickedIncrement")
export const ClickedReset = m("ClickedReset")
export const GotRepositorySelectorMessage = m("GotRepositorySelectorMessage", {
  message: RepositorySelector.Message,
})
export const GotThemeMessage = m("GotThemeMessage", {
  message: Theme.Message,
})
export const GotSidebarMessage = m("GotSidebarMessage", {
  message: AppSidebar.Message,
})
export const GotSetupMessage = m("GotSetupMessage", {
  message: Setup.Message,
})

export const Message = Schema.Union([
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,

  GotSidebarMessage,
  GotSetupMessage,
])
export type Message = typeof Message.Type

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
      ClickedDecrement: () => [evo(model, { count: (count) => count - 1 }), []],
      ClickedIncrement: () => [evo(model, { count: (count) => count + 1 }), []],
      ClickedReset: () => [evo(model, { count: () => 0 }), []],
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

export const init: Runtime.ApplicationInit<
  Model,
  Message,
  Flags,
  AppResources
> = (flags) => {
  const [sidebar, commands] = AppSidebar.init(flags.sidebar)
  const [setup, setupCommands] = Setup.init()

  return [
    { count: 0, setup, sidebar },
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

// const localSubscriptions = Subscription.make<Model, Message>()(() => ({
// sidebarMode: Subscription.persistent(
//   Stream.callback<Message>((queue) =>
//     Effect.acquireRelease(
//       Effect.sync(() => {
//         const mediaQuery = window.matchMedia(mobileViewportQuery)
//         const onChange = (event: MediaQueryListEvent) => {
//           Queue.offerUnsafe(
//             queue,
//             GotSidebarMessage({
//               message: AppSidebar.ChangedMode({
//                 mode: event.matches ? "Mobile" : "Desktop",
//               }),
//             }),
//           )
//         }
//         mediaQuery.addEventListener("change", onChange)
//         return { mediaQuery, onChange }
//       }),
//       ({ mediaQuery, onChange }) =>
//         Effect.sync(() => mediaQuery.removeEventListener("change", onChange)),
//     ),
//   ),
// ),
// }))

export const subscriptions = Subscription.aggregate<Model, Message>()(
  sidebarSubscriptions,
)

// VIEW

// const slopCopLogo = (h: HtmlBuilder<Message>): Html =>
//   h.svg(
//     [
//       h.ViewBox("0 0 24 24"),
//       h.Fill("none"),
//       h.AriaHidden(true),
//       h.Class("size-5"),
//     ],
//     [
//       h.path(
//         [
//           h.D(
//             "M12 2.2 5 4.6v6.1c0 4.4 2.8 8.3 7 9.6 4.2-1.3 7-5.2 7-9.6V4.6L12 2.2Z",
//           ),
//           h.Fill("currentColor"),
//           h.FillOpacity("0.16"),
//           h.Stroke("currentColor"),
//           h.StrokeWidth("1.5"),
//           h.StrokeLinejoin("round"),
//         ],
//         [],
//       ),
//       h.path(
//         [
//           h.D("M9.3 11.9l1.9 1.9 3.6-3.9"),
//           h.Stroke("currentColor"),
//           h.StrokeWidth("1.7"),
//           h.StrokeLinecap("round"),
//           h.StrokeLinejoin("round"),
//         ],
//         [],
//       ),
//     ],
//   )

// const sidebarContent = (
//   model: Model,
//   h: HtmlBuilder<Message>,
//   isCollapsed: boolean,
//   navigationAttributes: ReadonlyArray<ChildAttribute> = [],
// ): ReadonlyArray<Html> => [
//   h.div(
//     [h.Class("flex flex-col p-2 gap-3")],
//     [
//       h.div(
//         [
//           h.Class(
//             `flex items-center gap-2.5 px-1 pt-1 ${isCollapsed ? "justify-center" : ""}`,
//           ),
//         ],
//         [
//           h.span(
//             [
//               h.Class(
//                 "flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/25",
//               ),
//             ],
//             [slopCopLogo(h)],
//           ),
//           ...(isCollapsed
//             ? []
//             : [
//                 h.div(
//                   [h.Class("flex min-w-0 flex-col")],
//                   [
//                     h.span(
//                       [
//                         h.Class(
//                           "truncate text-sm leading-tight font-semibold tracking-tight",
//                         ),
//                       ],
//                       ["SlopCop"],
//                     ),
//                     h.span(
//                       [
//                         h.Class(
//                           "truncate text-xs leading-tight text-muted-foreground",
//                         ),
//                       ],
//                       ["Keeping your repos in line."],
//                     ),
//                   ],
//                 ),
//               ]),
//         ],
//       ),
//       h.submodel({
//         slotId: "repository-selector",
//         model: model.repositorySelector,
//         view: RepositorySelector.view,
//         toParentMessage: (message) =>
//           GotRepositorySelectorMessage({ message }),
//       }),
//     ],
//   ),
//   h.div(
//     [h.Class("flex h-16 items-center gap-3 border-b border-white/10 px-4")],
//     [
//       h.div(
//         [
//           h.AriaHidden(true),
//           h.Class(
//             "grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-300 font-mono text-xs font-black text-slate-950",
//           ),
//         ],
//         ["SC"],
//       ),
//       ...(isCollapsed
//         ? []
//         : [
//             h.div(
//               [],
//               [
//                 h.p([h.Class("font-black tracking-tight")], ["SlopCop"]),
//                 h.p([h.Class("text-xs text-slate-400")], ["Control room"]),
//               ],
//             ),
//           ]),
//     ],
//   ),
//   h.div(
//     [h.Class("border-b border-white/10 p-3")],
//     [
//       h.button(
//         [
//           ...navigationAttributes,
//           h.Class(
//             "flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10",
//           ),
//         ],
//         [
//           h.span(
//             [
//               h.AriaHidden(true),
//               h.Class(
//                 "grid size-8 shrink-0 place-items-center rounded-md bg-violet-400 font-mono text-xs font-bold text-slate-950",
//               ),
//             ],
//             ["E"],
//           ),
//           ...(isCollapsed
//             ? []
//             : [
//                 h.span(
//                   [h.Class("min-w-0")],
//                   [
//                     h.span(
//                       [h.Class("block text-xs text-slate-400")],
//                       ["Repository"],
//                     ),
//                     h.span(
//                       [h.Class("block truncate text-sm font-semibold")],
//                       ["effect/slopcop"],
//                     ),
//                   ],
//                 ),
//               ]),
//         ],
//       ),
//     ],
//   ),
//   h.nav(
//     [h.AriaLabel("Primary navigation"), h.Class("flex-1 space-y-1 p-3")],
//     navItems.map((item, index) =>
//       h.button(
//         [
//           ...navigationAttributes,
//           h.Class(
//             `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${index === 0 ? "bg-cyan-300 font-semibold text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`,
//           ),
//         ],
//         [
//           h.span(
//             [
//               h.AriaHidden(true),
//               h.Class("size-2 shrink-0 rounded-full bg-current"),
//             ],
//             [],
//           ),
//           ...(isCollapsed ? [] : [h.span([], [item])]),
//         ],
//       ),
//     ),
//   ),
//   ...(isCollapsed
//     ? []
//     : [
//         h.p(
//           [h.Class("border-t border-white/10 p-4 text-xs text-slate-500")],
//           ["Headless Foldkit Sidebar example"],
//         ),
//       ]),
// ]

// const counterContent = (
//   model: Model,
//   sidebarButton: ReadonlyArray<ChildAttribute>,
//   h: HtmlBuilder<Message>,
// ): Html =>
//   h.main(
//     [h.Class("min-w-0 flex-1 bg-background text-foreground")],
//     [
//       h.header(
//         [
//           h.Class(
//             "h-16 flex justify-between items-center px-6 md:px-4 bg-background/85 border-b border-border",
//           ),
//         ],
//         [
//           h.div(
//             [h.Class("flex gap-3")],
//             [
//               h.button(
//                 [
//                   ...sidebarButton,
//                   h.AriaLabel("Toggle sidebar"),
//                   h.Class(
//                     "grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg hover:bg-slate-100",
//                   ),
//                 ],
//                 ["≡"],
//               ),
//               h.div(
//                 [],
//                 [
//                   h.p(
//                     [h.Class("text-xs font-medium text-slate-500")],
//                     ["effect/slopcop"],
//                   ),
//                   h.h1([h.Class("font-bold")], ["Overview"]),
//                 ],
//               ),
//             ],
//           ),
//           h.submodel({
//             slotId: "theme-switcher",
//             model: model.theme,
//             view: Theme.view,
//             toParentMessage: (message) => GotThemeMessage({ message }),
//             viewInputs: { buttonStyle },
//           }),
//         ],
//       ),
//       h.div(
//         [h.Class("grid min-h-[calc(100svh-4rem)] place-items-center p-6")],
//         [
//           h.section(
//             [
//               h.AriaLabel("Counter example"),
//               h.Class(
//                 "w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm",
//               ),
//             ],
//             [
//               h.p(
//                 [
//                   h.Class(
//                     "text-xs font-bold uppercase tracking-[0.2em] text-slate-500",
//                   ),
//                 ],
//                 ["Counter"],
//               ),
//               h.p(
//                 [h.Class("my-6 text-7xl font-black tabular-nums")],
//                 [model.count.toString()],
//               ),
//               h.div(
//                 [h.Class("flex justify-center gap-3")],
//                 [
//                   Button.view(
//                     {
//                       onClick: ClickedDecrement(),
//                       toView: (attributes) =>
//                         h.button(
//                           [...attributes.button, h.Class(buttonStyle)],
//                           ["−"],
//                         ),
//                     },
//                     h,
//                   ),
//                   Button.view(
//                     {
//                       onClick: ClickedReset(),
//                       toView: (attributes) =>
//                         h.button(
//                           [...attributes.button, h.Class(buttonStyle)],
//                           ["Reset"],
//                         ),
//                     },
//                     h,
//                   ),
//                   Button.view(
//                     {
//                       onClick: ClickedIncrement(),
//                       toView: (attributes) =>
//                         h.button(
//                           [...attributes.button, h.Class(buttonStyle)],
//                           ["+"],
//                         ),
//                     },
//                     h,
//                   ),
//                 ],
//               ),
//             ],
//           ),
//         ],
//       ),
//     ],
//   )

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
            toView: (_) => h.div([], ["hi"]),
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
