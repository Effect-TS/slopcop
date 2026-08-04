import * as Sidebar from "@slopcop/ui/Sidebar"
import * as Theme from "../../features/theme"
import * as RepositorySelector from "../repository-selector"
import type { Command } from "./command"
import type { Flags } from "./flags"
import { Model } from "./model"
import { mapRepositorySelectorCommands, mapThemeCommands } from "./update"

export const init = (
  flags: Flags,
): readonly [Model, ReadonlyArray<Command>] => {
  const [repositorySelector, repositorySelectorCommands] =
    RepositorySelector.init()

  const sidebar = Sidebar.init({
    id: "app-sidebar",
    mode: flags.mode,
  })

  const [theme, themeCommands] = Theme.init(flags.theme)

  return [
    Model.make({ repositorySelector, sidebar, theme }, { disableChecks: true }),
    [
      ...mapRepositorySelectorCommands(repositorySelectorCommands),
      ...mapThemeCommands(themeCommands),
    ],
  ]
}
