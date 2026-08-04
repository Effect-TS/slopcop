import { ApiClient } from "../../api-client"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import * as FoldkitCommand from "foldkit/command"
import type { Message } from "./message"

export type Command = FoldkitCommand.Command<
  Message,
  never,
  KeyValueStore.KeyValueStore | ApiClient
>
