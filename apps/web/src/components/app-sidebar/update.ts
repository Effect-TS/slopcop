import * as Sidebar from "@slopcop/ui/Sidebar"
import * as Match from "effect/Match"
import * as FoldkitCommand from "foldkit/command"
import { evo } from "foldkit/struct"
import * as RepositorySelector from "../repository-selector"
import * as Theme from "../../features/theme"
import * as GitHubSync from "../../features/github-sync"
import type { Command } from "./command"
import {
  type Message,
  GotRepositorySelectorMessage,
  GotSidebarMessage,
  GotThemeMessage,
  GotGitHubSyncMessage,
} from "./message"
import type { Model } from "./model"

export type UpdateReturn = readonly [Model, ReadonlyArray<Command>]

export const mapRepositorySelectorCommands = (
  commands: ReadonlyArray<RepositorySelector.Command>,
): ReadonlyArray<Command> =>
  FoldkitCommand.mapMessages(commands, (message) =>
    GotRepositorySelectorMessage({ message }),
  )

export const mapThemeCommands = (
  commands: ReadonlyArray<Theme.Command>,
): ReadonlyArray<Command> =>
  FoldkitCommand.mapMessages(commands, (message) =>
    GotThemeMessage({ message }),
  )

export const mapSidebarCommands = (
  commands: ReadonlyArray<FoldkitCommand.Command<Sidebar.Message>>,
): ReadonlyArray<Command> =>
  FoldkitCommand.mapMessages(commands, (message) =>
    GotSidebarMessage({ message }),
  )

const mapGitHubSyncCommands = (
  commands: ReadonlyArray<GitHubSync.Command>,
): ReadonlyArray<Command> =>
  FoldkitCommand.mapMessages(commands, (message) =>
    GotGitHubSyncMessage({ message }),
  )

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tags({
      GotRepositorySelectorMessage: ({ message }) => {
        const [nextRepositorySelector, commands] = RepositorySelector.update(
          model.repositorySelector,
          message,
        )
        return [
          evo(model, { repositorySelector: () => nextRepositorySelector }),
          mapRepositorySelectorCommands(commands),
        ]
      },
      GotSidebarMessage: ({ message }) => {
        const [nextSidebar, commands] = Sidebar.update(model.sidebar, message)
        return [
          evo(model, { sidebar: () => nextSidebar }),
          mapSidebarCommands(commands),
        ]
      },
      GotThemeMessage: ({ message }) => {
        const [nextTheme, commands] = Theme.update(model.theme, message)
        return [
          evo(model, { theme: () => nextTheme }),
          mapThemeCommands(commands),
        ]
      },
      GotGitHubSyncMessage: ({ message }) => {
        const [githubSync, commands] = GitHubSync.update(
          model.githubSync,
          message,
        )
        return [
          evo(model, { githubSync: () => githubSync }),
          mapGitHubSyncCommands(commands),
        ]
      },
    }),
    Match.exhaustive,
  )
