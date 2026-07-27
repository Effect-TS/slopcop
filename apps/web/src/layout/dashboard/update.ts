import { Match as M } from "effect"
import { type Command } from "foldkit"
import { evo } from "foldkit/struct"

import { LoadAccessLogout } from "./command"
import type { Message } from "./message"
import type { Model } from "./model"

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedLogout: () => [model, [LoadAccessLogout()]],
      ToggledSidebar: () => [
        evo(model, { isSidebarOpen: (isOpen) => !isOpen }),
        [],
      ],
      ChangedRoute: () => [evo(model, { isSidebarOpen: () => false }), []],
      CompletedLoadExternal: () => [model, []],
    }),
  )
