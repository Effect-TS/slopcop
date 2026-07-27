import { Schema as S, pipe } from "effect"
import { Route } from "foldkit"
import { literal, r, slash, string } from "foldkit/route"

export const DashboardRoute = r("Dashboard")
export type DashboardRoute = typeof DashboardRoute.Type

export const RepositoriesRoute = r("Repositories")
export type RepositoriesRoute = typeof RepositoriesRoute.Type

export const ActivityRoute = r("Activity")
export const ReviewsRoute = r("Reviews")
export const SlopDetectionRoute = r("SlopDetection")
export const CommandsRoute = r("Commands")
export const SettingsRoute = r("Settings")

export const RepositoryWorkspaceRoute = r("RepositoryWorkspace", {
  owner: S.String,
  repo: S.String,
})
export type RepositoryWorkspaceRoute = typeof RepositoryWorkspaceRoute.Type

export const NotFoundRoute = r("NotFound", { path: S.String })
export type NotFoundRoute = typeof NotFoundRoute.Type

export const AppRoute = S.Union([
  DashboardRoute,
  RepositoriesRoute,
  ActivityRoute,
  ReviewsRoute,
  SlopDetectionRoute,
  CommandsRoute,
  SettingsRoute,
  RepositoryWorkspaceRoute,
  NotFoundRoute,
])
export type AppRoute = typeof AppRoute.Type

export const dashboardRouter = pipe(Route.root, Route.mapTo(DashboardRoute))
export const repositoriesRouter = pipe(
  literal("repositories"),
  Route.mapTo(RepositoriesRoute),
)
export const activityRouter = pipe(
  literal("activity"),
  Route.mapTo(ActivityRoute),
)
export const reviewsRouter = pipe(literal("reviews"), Route.mapTo(ReviewsRoute))
export const slopDetectionRouter = pipe(
  literal("slop-detection"),
  Route.mapTo(SlopDetectionRoute),
)
export const commandsRouter = pipe(
  literal("commands"),
  Route.mapTo(CommandsRoute),
)
export const settingsRouter = pipe(
  literal("settings"),
  Route.mapTo(SettingsRoute),
)
export const repositoryWorkspaceRouter = pipe(
  literal("repositories"),
  slash(string("owner")),
  slash(string("repo")),
  Route.mapTo(RepositoryWorkspaceRoute),
)

export const urlToAppRoute = Route.parseUrlWithFallback(
  Route.oneOf(
    repositoryWorkspaceRouter,
    repositoriesRouter,
    activityRouter,
    reviewsRouter,
    slopDetectionRouter,
    commandsRouter,
    settingsRouter,
    dashboardRouter,
  ),
  NotFoundRoute,
)

export const initialDashboardRoute = DashboardRoute()
