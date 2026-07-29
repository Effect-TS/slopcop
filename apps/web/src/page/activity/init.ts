import type { Command } from "foldkit"
import { ChangedRoute, type Message } from "./message"
import { ActivityNotAsked, type Model, Model as ModelSchema } from "./model"
import { update } from "./update"

type InitReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

export const init = (isActive: boolean): InitReturn => {
  const model = ModelSchema.make({
    repository: null,
    operation: "all",
    requestId: 0,
    repositories: [],
    loadMoreError: null,
    activity: ActivityNotAsked.make({}),
  })
  return isActive ? update(model, ChangedRoute()) : [model, []]
}

export const informRouteChanged = (model: Model): InitReturn =>
  update(model, ChangedRoute())
