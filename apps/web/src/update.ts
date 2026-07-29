import { Effect, Match as M, Schema as S } from "effect"
import { Command } from "foldkit"
import { load, pushUrl } from "foldkit/navigation"
import { evo } from "foldkit/struct"
import { toString as urlToString } from "foldkit/url"

import { Dashboard } from "./layout"
import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  GotActivityMessage,
  GotDashboardMessage,
  GotRepositoriesMessage,
  GotRepositoryWorkspaceMessage,
  type Message,
} from "./message"
import type { Model } from "./model"
import { Activity, Repositories, RepositoryWorkspace } from "./page"
import { urlToAppRoute } from "./route"

const NavigateInternal = Command.define(
  "NavigateInternal",
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

const LoadExternal = Command.define(
  "LoadExternal",
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ChangedUrl: ({ url }) => {
        const route = urlToAppRoute(url)
        const [dashboard, dashboardCommands] = Dashboard.informRouteChanged(
          model.dashboard,
        )
        const [repositories, repositoriesCommands] =
          route._tag === "Repositories"
            ? Repositories.informRouteChanged(model.repositories)
            : [model.repositories, []]
        const [repositoryWorkspace, repositoryWorkspaceCommands] =
          RepositoryWorkspace.informRouteChanged(
            model.repositoryWorkspace,
            route._tag === "RepositoryWorkspace"
              ? { owner: route.owner, repo: route.repo }
              : undefined,
          )
        const [activity, activityCommands] =
          route._tag === "Activity"
            ? Activity.informRouteChanged(model.activity)
            : [model.activity, []]
        return [
          evo(model, {
            route: () => route,
            dashboard: () => dashboard,
            repositories: () => repositories,
            repositoryWorkspace: () => repositoryWorkspace,
            activity: () => activity,
          }),
          [
            ...Command.mapMessages(dashboardCommands, (message) =>
              GotDashboardMessage({ message }),
            ),
            ...Command.mapMessages(repositoriesCommands, (message) =>
              GotRepositoriesMessage({ message }),
            ),
            ...Command.mapMessages(repositoryWorkspaceCommands, (message) =>
              GotRepositoryWorkspaceMessage({ message }),
            ),
            ...Command.mapMessages(activityCommands, (message) =>
              GotActivityMessage({ message }),
            ),
          ],
        ]
      },
      ClickedLink: ({ request }) =>
        M.value(request).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            Internal: ({ url }) => [
              model,
              [NavigateInternal({ url: urlToString(url) })],
            ],
            External: ({ href }) => [model, [LoadExternal({ href })]],
          }),
        ),
      GotDashboardMessage: ({ message }) => {
        const [dashboard, commands] = Dashboard.update(model.dashboard, message)
        return [
          evo(model, { dashboard: () => dashboard }),
          Command.mapMessages(commands, (message) =>
            GotDashboardMessage({ message }),
          ),
        ]
      },
      GotRepositoriesMessage: ({ message }) => {
        const [repositories, commands] = Repositories.update(
          model.repositories,
          message,
        )
        return [
          evo(model, { repositories: () => repositories }),
          Command.mapMessages(commands, (message) =>
            GotRepositoriesMessage({ message }),
          ),
        ]
      },
      GotRepositoryWorkspaceMessage: ({ message }) => {
        const [repositoryWorkspace, commands] = RepositoryWorkspace.update(
          model.repositoryWorkspace,
          message,
        )
        return [
          evo(model, { repositoryWorkspace: () => repositoryWorkspace }),
          Command.mapMessages(commands, (message) =>
            GotRepositoryWorkspaceMessage({ message }),
          ),
        ]
      },
      GotActivityMessage: ({ message }) => {
        const [activity, commands] = Activity.update(model.activity, message)
        return [
          evo(model, { activity: () => activity }),
          Command.mapMessages(commands, (message) =>
            GotActivityMessage({ message }),
          ),
        ]
      },
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],
    }),
  )
