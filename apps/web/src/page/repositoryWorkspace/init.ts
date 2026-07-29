import type * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import type { Command } from "foldkit"

import { ChangedRoute, LeftRoute, type Message } from "./message"
import { type Model, WorkspaceInactive } from "./model"
import { update } from "./update"

type InitReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

export const init = (
  repository: typeof LabelingRuleManagement.RepositoryPath.Type | undefined,
): InitReturn => {
  const model = WorkspaceInactive.make({ generation: 0 })
  return repository === undefined
    ? [model, []]
    : update(model, ChangedRoute(repository))
}

export const informRouteChanged = (
  model: Model,
  repository: typeof LabelingRuleManagement.RepositoryPath.Type | undefined,
): InitReturn =>
  update(
    model,
    repository === undefined ? LeftRoute() : ChangedRoute(repository),
  )
