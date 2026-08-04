import * as Match from "effect/Match"
import type { Command } from "./command"
import { RefreshSetup } from "./command"
import type { Message } from "./message"
import { Model } from "./model"

export type UpdateReturn = readonly [Model, ReadonlyArray<Command>]

export const update = (_model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      RequestedSetupRefresh: () => [
        Model.cases.LoadingSetup.make({}),
        [RefreshSetup()],
      ],
      LoadedSetup: ({ setup }) => [setup, []],
      FailedToLoadSetup: ({ message }) => [
        Model.cases.SetupRequestFailed.make({ message }),
        [],
      ],
    }),
  )
