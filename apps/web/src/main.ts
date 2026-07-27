import { Command, Runtime } from "foldkit"

import { Dashboard } from "./layout"
import {
  GotDashboardMessage,
  GotRepositoriesMessage,
  type Message,
} from "./message"
import { type Model, Model as ModelSchema } from "./model"
import { Repositories } from "./page"
import { urlToAppRoute } from "./route"

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url) => {
  const route = urlToAppRoute(url)
  const [dashboard, dashboardCommands] = Dashboard.init()
  const [repositories, repositoriesCommands] = Repositories.init(
    route._tag === "Repositories",
  )

  return [
    ModelSchema.make({ route, dashboard, repositories }),
    [
      ...Command.mapMessages(dashboardCommands, (message) =>
        GotDashboardMessage({ message }),
      ),
      ...Command.mapMessages(repositoriesCommands, (message) =>
        GotRepositoriesMessage({ message }),
      ),
    ],
  ]
}
