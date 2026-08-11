import * as Match from "effect/Match"
import { evo } from "foldkit/struct"
import { UpdateRepositoryEnabled, type Command } from "./command"
import type { Message } from "./message"
import { SaveState, type Model } from "./model"

export type UpdateReturn = readonly [Model, ReadonlyArray<Command>]

const isCurrentRequest = (
  model: Model,
  requestId: number,
  repository: { readonly owner: string; readonly repo: string },
): boolean =>
  model.repository !== null &&
  model.repository.owner === repository.owner &&
  model.repository.repo === repository.repo &&
  model.saveState._tag === "SaveSaving" &&
  model.saveState.requestId === requestId

const save = (model: Model): UpdateReturn => {
  if (model.repository === null || model.saveState._tag === "SaveSaving") {
    return [model, []]
  }

  const enabled = !model.enabled
  const requestId = model.nextRequestId
  return [
    evo(model, {
      saveState: () => SaveState.cases.SaveSaving.make({ requestId, enabled }),
      nextRequestId: (id) => id + 1,
    }),
    [
      UpdateRepositoryEnabled({
        requestId,
        repository: {
          owner: model.repository.owner,
          repo: model.repository.repo,
        },
        enabled,
      }),
    ],
  ]
}

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      ToggledEnabled: () => save(model),
      UpdatedRepositoryEnabled: ({ requestId, repository }) =>
        isCurrentRequest(model, requestId, repository)
          ? [
              evo(model, {
                repository: () => repository,
                enabled: () => repository.enabled,
                saveState: () => SaveState.cases.SaveIdle.make({}),
              }),
              [],
            ]
          : [model, []],
      FailedToUpdateRepositoryEnabled: ({ requestId, repository, message }) =>
        isCurrentRequest(model, requestId, repository)
          ? [
              evo(model, {
                saveState: () => SaveState.cases.SaveFailed.make({ message }),
              }),
              [],
            ]
          : [model, []],
      SelectedRepositoryChanged: ({ repository }) => [
        evo(model, {
          repository: () => repository,
          enabled: () => repository?.enabled ?? false,
          saveState: () => SaveState.cases.SaveIdle.make({}),
        }),
        [],
      ],
    }),
  )
