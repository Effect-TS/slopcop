import * as UiCommand from "@slopcop/ui/Command"
import * as Popover from "@foldkit/ui/popover"
import { LoadRepositories, type Command } from "./command"
import { RepositoryLoadState, type Model } from "./model"

export const init = (): readonly [Model, ReadonlyArray<Command>] => {
  const command = UiCommand.init({
    id: "repository-selector-command",
  })

  const popover = Popover.init({
    id: "repository-selector-popover",
    isAnimated: true,
    contentFocus: true,
  })

  return [
    {
      command,
      popover,
      repositories: RepositoryLoadState.cases.RepositoriesLoading.make({}),
      selected: null,
    },
    [LoadRepositories()],
  ]
}
