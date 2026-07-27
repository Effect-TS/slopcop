import type { Command } from "foldkit"

import { ChangedRoute, type Message } from "./message"
import { type Model, Model as ModelSchema } from "./model"
import { update } from "./update"

type InitReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

export const init = (): InitReturn => [
  ModelSchema.make({ isSidebarOpen: false }),
  [],
]

export const informRouteChanged = (model: Model): InitReturn =>
  update(model, ChangedRoute())
