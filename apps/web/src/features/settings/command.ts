import { ApiClient } from "../../api-client"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as FoldkitCommand from "foldkit/command"
import {
  FailedToUpdateRepositoryEnabled,
  UpdatedRepositoryEnabled,
  type Message,
} from "./message"

export type Command = FoldkitCommand.Command<Message, never, ApiClient>

const failureMessage = (error: { readonly _tag: string }): string =>
  error._tag === "RepositoryNotFound"
    ? "This repository is no longer configured in SlopCop. Select another repository or reload, then retry. Its enabled state was not changed."
    : "Could not update this repository. Check your connection and use the switch to retry. Its enabled state was not changed."

export const UpdateRepositoryEnabled = FoldkitCommand.define(
  "UpdateRepositoryEnabled",
  {
    args: {
      requestId: Schema.Int,
      repository: RepositoryManagement.RepositoryPath,
      enabled: Schema.Boolean,
    },
    messages: [UpdatedRepositoryEnabled, FailedToUpdateRepositoryEnabled],
    execute: ({ requestId, repository, enabled }) =>
      Effect.gen(function* () {
        const client = yield* ApiClient
        const updated = yield* client.repositories.updateRepositoryEnabled({
          params: repository,
          payload: { enabled },
        })
        return UpdatedRepositoryEnabled({ requestId, repository: updated })
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            FailedToUpdateRepositoryEnabled({
              requestId,
              repository,
              message: failureMessage(error),
            }),
          ),
        ),
      ),
  },
)
