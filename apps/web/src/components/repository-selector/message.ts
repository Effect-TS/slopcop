import * as Command from "@slopcop/ui/Command"
import * as Popover from "@foldkit/ui/popover"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"

export const SelectedRepository = m("SelectedRepository", {
  value: Schema.String,
})
export type SelectedRepository = typeof SelectedRepository.Type

export const LoadedRepositories = m("LoadedRepositories", {
  repositories: Schema.Array(RepositoryManagement.RepositorySummary),
})
export type LoadedRepositories = typeof LoadedRepositories.Type

export const FailedToLoadRepositories = m("FailedToLoadRepositories", {
  message: Schema.NonEmptyString,
})
export type FailedToLoadRepositories = typeof FailedToLoadRepositories.Type

export const GotCommandMessage = m("GotCommandMessage", {
  message: Command.Message,
})
export type GotCommandMessage = typeof GotCommandMessage.Type

export const GotPopoverMessage = m("GotPopoverMessage", {
  message: Popover.Message,
})
export type GotPopoverMessage = typeof GotPopoverMessage.Type

export const Message = Schema.Union([
  SelectedRepository,
  LoadedRepositories,
  FailedToLoadRepositories,

  GotCommandMessage,
  GotPopoverMessage,
])
export type Message = typeof Message.Type
