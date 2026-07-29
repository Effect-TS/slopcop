import { Schema as S } from "effect"

import { Dashboard } from "./layout"
import { Activity, Repositories, RepositoryWorkspace } from "./page"
import { AppRoute } from "./route"

export const Model = S.Struct({
  route: AppRoute,
  dashboard: Dashboard.Model,
  repositories: Repositories.Model,
  repositoryWorkspace: RepositoryWorkspace.Model,
  activity: Activity.Model,
})
export type Model = typeof Model.Type
