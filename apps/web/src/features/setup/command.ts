import { ApiClient } from "../../api-client"
import * as Effect from "effect/Effect"
import * as FoldkitCommand from "foldkit/command"
import { FailedToLoadSetup, LoadedSetup, type Message } from "./message"

export type Command = FoldkitCommand.Command<Message, never, ApiClient>

const loadFailure = FailedToLoadSetup({
  message: "Could not check GitHub setup. Try again.",
})

const loadSetupEffect = Effect.gen(function* () {
  const client = yield* ApiClient
  const setup = yield* client.setup.getSetupStatus({})
  if (setup._tag !== "AppNotInstalled") {
    return LoadedSetup({ setup })
  }

  const refreshed = yield* client.setup.refreshSetup({})
  return LoadedSetup({ setup: refreshed })
}).pipe(Effect.orElseSucceed(() => loadFailure))

const refreshSetupEffect = Effect.gen(function* () {
  const client = yield* ApiClient
  const setup = yield* client.setup.refreshSetup({})
  return LoadedSetup({ setup })
}).pipe(Effect.orElseSucceed(() => loadFailure))

export const LoadSetup = FoldkitCommand.define("LoadSetup", {
  messages: [LoadedSetup, FailedToLoadSetup],
  execute: loadSetupEffect,
})

export const RefreshSetup = FoldkitCommand.define("RefreshSetup", {
  messages: [LoadedSetup, FailedToLoadSetup],
  execute: refreshSetupEffect,
})
