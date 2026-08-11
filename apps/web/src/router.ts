import { pipe } from "effect/Function"
import * as Schema from "effect/Schema"
import * as Route from "foldkit/route"

export const RootRoute = Route.r("Root")
export type RootRoute = typeof RootRoute.Type

export const AutoLabelingRoute = Route.r("AutoLabeling")
export type AutoLabelingRoute = typeof AutoLabelingRoute.Type

export const PoliciesRoute = Route.r("Policies")
export type PoliciesRoute = typeof PoliciesRoute.Type

export const SettingsRoute = Route.r("Settings")
export type SettingsRoute = typeof SettingsRoute.Type

export const NotFoundRoute = Route.r("NotFound", { path: Schema.String })
export type NotFoundRoute = typeof NotFoundRoute.Type

export const AppRoute = Schema.Union([
  RootRoute,
  AutoLabelingRoute,
  PoliciesRoute,
  SettingsRoute,
  NotFoundRoute,
])
export type AppRoute = typeof AppRoute.Type

export const rootRouter = pipe(Route.root, Route.mapTo(RootRoute))

export const autoLabelingRouter = pipe(
  Route.literal("auto-labeling"),
  Route.mapTo(AutoLabelingRoute),
)

export const policiesRouter = pipe(
  Route.literal("policies"),
  Route.mapTo(PoliciesRoute),
)

export const settingsRouter = pipe(
  Route.literal("settings"),
  Route.mapTo(SettingsRoute),
)

const routeParser = Route.oneOf(
  autoLabelingRouter,
  policiesRouter,
  settingsRouter,
  rootRouter,
)

export const urlToAppRoute = Route.parseUrlWithFallback(
  routeParser,
  NotFoundRoute,
)
