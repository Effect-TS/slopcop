import { pipe } from "effect/Function"
import * as Schema from "effect/Schema"
import * as Route from "foldkit/route"

export const RootRoute = Route.r("Root")
export type RootRoute = typeof RootRoute.Type

export const AutoLabelingRoute = Route.r("AutoLabeling")
export type AutoLabelingRoute = typeof AutoLabelingRoute.Type

export const NotFoundRoute = Route.r("NotFound", { path: Schema.String })
export type NotFoundRoute = typeof NotFoundRoute.Type

export const AppRoute = Schema.Union([
  RootRoute,
  AutoLabelingRoute,
  NotFoundRoute,
])
export type AppRoute = typeof AppRoute.Type

export const rootRouter = pipe(Route.root, Route.mapTo(RootRoute))

export const autoLabelingRouter = pipe(
  Route.literal("auto-labeling"),
  Route.mapTo(AutoLabelingRoute),
)

const routeParser = Route.oneOf(autoLabelingRouter, rootRouter)

export const urlToAppRoute = Route.parseUrlWithFallback(
  routeParser,
  NotFoundRoute,
)
