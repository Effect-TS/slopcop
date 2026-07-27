import { Schema as S, pipe } from "effect"
import { Route } from "foldkit"
import { r } from "foldkit/route"

export const DashboardRoute = r("Dashboard")
export type DashboardRoute = typeof DashboardRoute.Type

export const NotFoundRoute = r("NotFound", { path: S.String })
export type NotFoundRoute = typeof NotFoundRoute.Type

export const AppRoute = S.Union([DashboardRoute, NotFoundRoute])
export type AppRoute = typeof AppRoute.Type

export const dashboardRouter = pipe(Route.root, Route.mapTo(DashboardRoute))

export const urlToAppRoute = Route.parseUrlWithFallback(
  Route.oneOf(dashboardRouter),
  NotFoundRoute,
)

export const initialDashboardRoute = DashboardRoute()
