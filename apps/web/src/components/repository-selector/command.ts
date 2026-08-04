import { ApiClient } from "../../api-client"
import * as Effect from "effect/Effect"
import * as FoldkitCommand from "foldkit/command"
import {
  FailedToLoadRepositories,
  LoadedRepositories,
  type Message,
} from "./message"

export type Command = FoldkitCommand.Command<Message, never, ApiClient>

const loadRepositoriesEffect = Effect.gen(function* () {
  const client = yield* ApiClient
  const response = yield* client.repositories.listRepositories({})
  return LoadedRepositories({ repositories: response.repositories })
}).pipe(
  Effect.orElseSucceed(() =>
    FailedToLoadRepositories({
      message: "Could not load repositories. Try again.",
    }),
  ),
)

export const LoadRepositories = FoldkitCommand.define("LoadRepositories", {
  messages: [LoadedRepositories, FailedToLoadRepositories],
  execute: loadRepositoriesEffect,
})
