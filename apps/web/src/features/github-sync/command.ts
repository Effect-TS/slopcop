import * as Effect from "effect/Effect"
import * as FoldkitCommand from "foldkit/command"
import { ApiClient } from "../../api-client"
import {
  AcceptedSync,
  FailedSync,
  LoadedSyncStatus,
  type Message,
} from "./message"

export type Command = FoldkitCommand.Command<Message, never, ApiClient>

const failure = FailedSync({
  message:
    "GitHub data synchronization could not complete. Existing cached data was preserved.",
})

export const StartSync = FoldkitCommand.define("StartGitHubSync", {
  messages: [AcceptedSync, FailedSync],
  execute: Effect.gen(function* () {
    const client = yield* ApiClient
    const status = yield* client.setup.getGitHubDataSyncStatus({})
    yield* client.setup.refreshGitHubData({})
    return AcceptedSync({
      previousAttemptAt: status.lastAttemptAt,
      previousSuccessAt: status.lastSuccessAt,
    })
  }).pipe(Effect.orElseSucceed(() => failure)),
})

export const PollSync = FoldkitCommand.define("PollGitHubSync", {
  messages: [LoadedSyncStatus, FailedSync],
  execute: Effect.sleep("2 seconds").pipe(
    Effect.andThen(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return LoadedSyncStatus({
          status: yield* client.setup.getGitHubDataSyncStatus({}),
        })
      }),
    ),
    Effect.orElseSucceed(() => failure),
  ),
})
