import { Effect, Match as M, Schema as S } from "effect"
import { Command } from "foldkit"
import { load, pushUrl } from "foldkit/navigation"
import { evo } from "foldkit/struct"
import { toString as urlToString } from "foldkit/url"

import { Dashboard } from "./layout"
import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  GotDashboardMessage,
  GotRepositoriesMessage,
  type Message,
} from "./message"
import type { Model } from "./model"
import { Repositories } from "./page"
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
        return [
          evo(model, {
            route: () => route,
            dashboard: () => dashboard,
            repositories: () => repositories,
          }),
          [
            ...Command.mapMessages(dashboardCommands, (message) =>
              GotDashboardMessage({ message }),
            ),
            ...Command.mapMessages(repositoriesCommands, (message) =>
              GotRepositoriesMessage({ message }),
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
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],
    }),
  )
