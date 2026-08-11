import { evo } from "foldkit/struct"
import type { Message } from "./message"
import type { Model } from "./model"
import { validateSource } from "./validation"

export type UpdateReturn = readonly [Model, readonly []]

export const update = (model: Model, message: Message): UpdateReturn => {
  switch (message._tag) {
    case "MountedEditor":
      return [evo(model, { mountStatus: () => "Ready" }), []]
    case "FailedToMountEditor":
      return [
        evo(model, {
          mountStatus: () => "Failed",
          error: () => message.reason,
        }),
        [],
      ]
    case "EditedSource": {
      const validation = validateSource(message.source)
      return validation._tag === "Valid"
        ? [
            evo(model, {
              source: () => message.source,
              program: () => validation.program,
              error: () => null,
            }),
            [],
          ]
        : [
            evo(model, {
              source: () => message.source,
              program: () => null,
              error: () => validation.message,
            }),
            [],
          ]
    }
  }
}
