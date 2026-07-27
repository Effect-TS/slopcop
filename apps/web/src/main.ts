import { Runtime } from "foldkit"

import type { Message } from "./message"
import {
  type Model,
  Model as ModelSchema,
  NoPatrolNotice,
  RepositoriesLoading,
  RepositoriesNotAsked,
} from "./model"
import { urlToAppRoute } from "./route"
import { LoadRepositories } from "./update"

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url) => {
  const route = urlToAppRoute(url)
  const shouldLoadRepositories = route._tag === "Repositories"

  return [
    ModelSchema.make({
      route,
      isSidebarOpen: false,
      repositoryQuery: "",
      repositories: shouldLoadRepositories
        ? RepositoriesLoading.make({})
        : RepositoriesNotAsked.make({}),
      patrolNotice: NoPatrolNotice.make({}),
    }),
    shouldLoadRepositories ? [LoadRepositories()] : [],
  ]
}
