import type { Command } from "foldkit"

import { ChangedRoute, type Message } from "./message"
import {
  type Model,
  Model as ModelSchema,
  NoPatrolNotice,
  RepositoriesNotAsked,
} from "./model"
import { update } from "./update"

type InitReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

export const init = (isActive: boolean): InitReturn => {
  const model = ModelSchema.make({
    query: "",
    repositories: RepositoriesNotAsked.make({}),
    patrolNotice: NoPatrolNotice.make({}),
  })
  return isActive ? informRouteChanged(model) : [model, []]
}

export const informRouteChanged = (model: Model): InitReturn =>
  update(model, ChangedRoute())
