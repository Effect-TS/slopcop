import { evo } from "foldkit/struct"
import type { Message } from "./message"
import type { Model } from "./model"

export type UpdateReturn = readonly [Model, readonly []]

export const update = (model: Model, message: Message): UpdateReturn => {
  switch (message._tag) {
    case "MountedEditor":
      return [evo(model, { mountStatus: () => "Ready" }), []]
    case "FailedToMountEditor":
      return [
        evo(model, {
          mountStatus: () => "Failed",
          mountError: () => message.reason,
        }),
        [],
      ]
    case "EditedSource":
      return [evo(model, { source: () => message.source }), []]
  }
}
