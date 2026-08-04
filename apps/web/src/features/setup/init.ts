import { LoadSetup, type Command } from "./command"
import { Model } from "./model"

export const init = (): readonly [Model, ReadonlyArray<Command>] => [
  Model.cases.LoadingSetup.make({}),
  [LoadSetup()],
]
