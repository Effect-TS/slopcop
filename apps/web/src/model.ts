import { Schema as S } from "effect"

import { Dashboard } from "./layout"
import { Repositories } from "./page"
import { AppRoute } from "./route"

export const Model = S.Struct({
  route: AppRoute,
  dashboard: Dashboard.Model,
  repositories: Repositories.Model,
})
export type Model = typeof Model.Type
