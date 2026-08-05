import * as UiCommand from "@slopcop/ui/Command"
import * as Popover from "@foldkit/ui/popover"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as FoldkitCommand from "foldkit/command"
import { evo } from "foldkit/struct"
import type { Command } from "./command"
import { GotCommandMessage, GotPopoverMessage, type Message } from "./message"
import {
  reconcileSelectedRepository,
  RepositoryLoadState,
  type Model,
} from "./model"

export type UpdateReturn = readonly [Model, ReadonlyArray<Command>]

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      SelectedRepository: ({ value }) => selectRepository(model, value),
      LoadedRepositories: ({ repositories }) => [
        evo(model, {
          repositories: () =>
            RepositoryLoadState.cases.RepositoriesLoaded.make({ repositories }),
          selected: () =>
            reconcileSelectedRepository(model.selected, repositories),
        }),
        [],
      ],
      FailedToLoadRepositories: ({ message }) => [
        evo(model, {
          repositories: () =>
            RepositoryLoadState.cases.RepositoriesFailed.make({ message }),
        }),
        [],
      ],

      GotCommandMessage: ({ message }) => delegateToCommand(model, message),
      GotPopoverMessage: ({ message }) => delegateToPopover(model, message),
    }),
  )

const selectRepository = (model: Model, value: string): UpdateReturn => {
  const [nextPopover, popoverCommands] = Popover.close(model.popover)
  return [
    evo(model, {
      popover: () => nextPopover,
      selected: () => value,
    }),
    mapPopoverCommands(popoverCommands),
  ]
}

const delegateToCommand = (
  model: Model,
  message: UiCommand.Message,
): UpdateReturn => {
  const [nextCommand, commands, outMessage] = UiCommand.update(
    model.command,
    message,
  )

  const mappedCommands = mapCommandCommands(commands)

  const nextModel = evo(model, { command: () => nextCommand })

  return Option.match(outMessage, {
    onNone: () => [nextModel, mappedCommands] as const,
    onSome: Match.type<UiCommand.OutMessage>().pipe(
      Match.tagsExhaustive({
        Selected: ({ value }) => {
          const [selectedModel, selectedCommands] = selectRepository(
            nextModel,
            value,
          )
          return [
            selectedModel,
            [...mappedCommands, ...selectedCommands],
          ] as const
        },
      }),
    ),
  })
}

const delegateToPopover = (
  model: Model,
  message: Popover.Message,
): UpdateReturn => {
  const [nextPopover, commands, outMessage] = Popover.update(
    model.popover,
    message,
  )

  const mappedCommands = mapPopoverCommands(commands)

  return Option.match(outMessage, {
    onNone: () =>
      [evo(model, { popover: () => nextPopover }), mappedCommands] as const,
    onSome: Match.type<Popover.OutMessage>().pipe(
      Match.tagsExhaustive({
        Opened: () =>
          [evo(model, { popover: () => nextPopover }), mappedCommands] as const,
        Closed: () =>
          [evo(model, { popover: () => nextPopover }), mappedCommands] as const,
      }),
    ),
  })
}

const mapCommandCommands = FoldkitCommand.mapMessages(
  (message: UiCommand.Message) => GotCommandMessage({ message }),
)

const mapPopoverCommands = FoldkitCommand.mapMessages(
  (message: Popover.Message) => GotPopoverMessage({ message }),
)
