import * as DateTime from "effect/DateTime"
import * as Match from "effect/Match"
import * as FoldkitCommand from "foldkit/command"
import { evo } from "foldkit/struct"
import { PollSync, StartSync, type Command } from "./command"
import { GotToastMessage, type Message } from "./message"
import type { Model } from "./model"
import { Toast } from "./toast"

type UpdateReturn = readonly [Model, ReadonlyArray<Command>]

const idle = (model: Model): Model =>
  evo(model, {
    state: () => "idle",
    previousAttemptAt: () => null,
    previousSuccessAt: () => null,
  })

const showToast = (
  model: Model,
  variant: "Info" | "Success" | "Error",
  title: string,
  detail: string,
): UpdateReturn => {
  const [toast, commands] = Toast.show(model.toast, {
    variant,
    payload: { title, detail },
  })
  return [
    evo(model, { toast: () => toast }),
    FoldkitCommand.mapMessages(commands, (message) =>
      GotToastMessage({ message }),
    ),
  ]
}

const replaceToasts = (
  model: Model,
  variant: "Success" | "Error",
  title: string,
  detail: string,
): UpdateReturn => {
  const [cleared, dismissCommands] = Toast.dismissAll(model.toast)
  const [nextModel, showCommands] = showToast(
    evo(model, { toast: () => cleared }),
    variant,
    title,
    detail,
  )
  return [
    nextModel,
    [
      ...FoldkitCommand.mapMessages(dismissCommands, (message) =>
        GotToastMessage({ message }),
      ),
      ...showCommands,
    ],
  ]
}

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tags({
      RequestedSync: () =>
        model.state === "idle"
          ? [evo(model, { state: () => "queueing" }), [StartSync()]]
          : [model, []],
      AcceptedSync: ({ previousAttemptAt, previousSuccessAt }) => {
        const polling = evo(model, {
          state: () => "polling",
          previousAttemptAt: () => previousAttemptAt,
          previousSuccessAt: () => previousSuccessAt,
        })
        const [notified, commands] = showToast(
          polling,
          "Info",
          "GitHub sync queued",
          "Repository labels and pull requests are refreshing in the background.",
        )
        return [notified, [...commands, PollSync()]]
      },
      LoadedSyncStatus: ({ status }) => {
        const attemptChanged =
          status.lastAttemptAt !== null &&
          (model.previousAttemptAt === null ||
            DateTime.toEpochMillis(status.lastAttemptAt) !==
              DateTime.toEpochMillis(model.previousAttemptAt))
        const successChanged =
          status.lastSuccessAt !== null &&
          (model.previousSuccessAt === null ||
            DateTime.toEpochMillis(status.lastSuccessAt) !==
              DateTime.toEpochMillis(model.previousSuccessAt))
        if (
          status.status === "pending" ||
          status.status === "refreshing" ||
          (!attemptChanged && !successChanged)
        ) {
          return [model, [PollSync()]]
        }
        if (status.status === "failed") {
          return replaceToasts(
            idle(model),
            "Error",
            "GitHub sync finished with errors",
            `${status.failedDatasets} dataset${status.failedDatasets === 1 ? "" : "s"} failed to refresh. Existing cached data was preserved.`,
          )
        }
        return replaceToasts(
          idle(model),
          "Success",
          "GitHub sync complete",
          status.lastSuccessAt === null
            ? "Repository labels and pull requests are up to date."
            : `Repository labels and pull requests were refreshed at ${DateTime.formatIso(status.lastSuccessAt)}.`,
        )
      },
      FailedSync: ({ message }) =>
        replaceToasts(idle(model), "Error", "GitHub sync failed", message),
      GotToastMessage: ({ message }) => {
        const [toast, commands] = Toast.update(model.toast, message)
        return [
          evo(model, { toast: () => toast }),
          FoldkitCommand.mapMessages(commands, (childMessage) =>
            GotToastMessage({ message: childMessage }),
          ),
        ]
      },
    }),
    Match.exhaustive,
  )
