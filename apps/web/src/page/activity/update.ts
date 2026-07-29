import { Match as M } from "effect"
import type { Command } from "foldkit"
import { LoadActivity } from "./command"
import type { Message } from "./message"
import {
  ActivityFailed,
  ActivityLoading,
  ActivityLoadingMore,
  ActivityReady,
  type Model,
} from "./model"

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

const load = (
  model: Model,
  repository: string | null,
  operation: Model["operation"],
  cursor: Extract<Model["activity"], { readonly _tag: "Ready" }>["nextCursor"],
): UpdateReturn => {
  const requestId = model.requestId + 1
  return [
    {
      ...model,
      repository,
      operation,
      requestId,
      loadMoreError: null,
      activity:
        cursor === null
          ? ActivityLoading.make({})
          : ActivityLoadingMore.make({
              entries:
                model.activity._tag === "Ready" ? model.activity.entries : [],
              cursor,
            }),
    },
    [LoadActivity({ requestId, repository, operation, cursor })],
  ]
}

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ChangedRoute: () => load(model, model.repository, model.operation, null),
      RequestedActivity: () =>
        load(model, model.repository, model.operation, null),
      ChangedActivityRepository: ({ repository }) =>
        load(model, repository, model.operation, null),
      ChangedActivityOperation: ({ operation }) =>
        load(model, model.repository, operation, null),
      RequestedMoreActivity: () =>
        model.activity._tag === "Ready" && model.activity.nextCursor !== null
          ? load(
              model,
              model.repository,
              model.operation,
              model.activity.nextCursor,
            )
          : [model, []],
      LoadedActivity: ({
        requestId,
        repository,
        operation,
        cursor,
        entries,
        repositories,
        nextCursor,
      }) => {
        if (
          model.requestId !== requestId ||
          model.repository !== repository ||
          model.operation !== operation
        ) {
          return [model, []]
        }
        if (cursor === null && model.activity._tag === "Loading") {
          return [
            {
              ...model,
              repositories,
              loadMoreError: null,
              activity: ActivityReady.make({ entries, nextCursor }),
            },
            [],
          ]
        }
        if (
          cursor !== null &&
          model.activity._tag === "LoadingMore" &&
          model.activity.cursor === cursor
        ) {
          return [
            {
              ...model,
              repositories,
              loadMoreError: null,
              activity: ActivityReady.make({
                entries: [...model.activity.entries, ...entries],
                nextCursor,
              }),
            },
            [],
          ]
        }
        return [model, []]
      },
      FailedToLoadActivity: ({
        requestId,
        repository,
        operation,
        cursor,
        message,
      }) => {
        if (
          model.requestId !== requestId ||
          model.repository !== repository ||
          model.operation !== operation
        ) {
          return [model, []]
        }
        if (cursor === null && model.activity._tag === "Loading") {
          return [{ ...model, activity: ActivityFailed.make({ message }) }, []]
        }
        if (
          cursor !== null &&
          model.activity._tag === "LoadingMore" &&
          model.activity.cursor === cursor
        ) {
          return [
            {
              ...model,
              activity: ActivityReady.make({
                entries: model.activity.entries,
                nextCursor: cursor,
              }),
              loadMoreError: message,
            },
            [],
          ]
        }
        return [model, []]
      },
    }),
  )
