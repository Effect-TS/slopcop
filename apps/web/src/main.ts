import { Command, Runtime } from "foldkit"

import { Dashboard } from "./layout"
import {
  GotDashboardMessage,
  GotActivityMessage,
  GotRepositoriesMessage,
  GotRepositoryWorkspaceMessage,
  type Message,
} from "./message"
import { type Model, Model as ModelSchema } from "./model"
import { Activity, Repositories, RepositoryWorkspace } from "./page"
import { urlToAppRoute } from "./route"

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url) => {
  const route = urlToAppRoute(url)
  const [dashboard, dashboardCommands] = Dashboard.init()
  const [repositories, repositoriesCommands] = Repositories.init(
    route._tag === "Repositories",
  )
  const [repositoryWorkspace, repositoryWorkspaceCommands] =
    RepositoryWorkspace.init(
      route._tag === "RepositoryWorkspace"
        ? { owner: route.owner, repo: route.repo }
        : undefined,
    )
  const [activity, activityCommands] = Activity.init(route._tag === "Activity")

  return [
    ModelSchema.make({
      route,
      dashboard,
      repositories,
      repositoryWorkspace,
      activity,
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
}
