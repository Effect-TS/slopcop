import { Runtime } from "foldkit"

import type { Message } from "./message"
import { type Model, Model as ModelSchema } from "./model"
import { urlToAppRoute } from "./route"

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url) => [
  ModelSchema.make({ route: urlToAppRoute(url) }),
  [],
]
