import * as Menu from "@foldkit/ui/menu"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as FoldkitCommand from "foldkit/command"
import { evo } from "foldkit/struct"
import { type Command, PersistThemePreference } from "./command"
import { GotThemeMenuMessage, type Message } from "./message"
import {
  type Model,
  type ThemePreference,
  ThemeMenu,
  resolveTheme,
} from "./model"

export type UpdateReturn = readonly [Model, ReadonlyArray<Command>]

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tags({
      ChangedSystemTheme: ({ theme }) => {
        const resolvedTheme = resolveTheme({
          preferredTheme: model.preferredTheme,
          systemTheme: theme,
        })

        return [
          evo(model, {
            systemTheme: () => theme,
            resolvedTheme: () => resolvedTheme,
          }),
          [],
        ]
      },
      GotThemeMenuMessage: ({ message }) => {
        const [nextMenu, commands, outMessage] = ThemeMenu.update(
          model.menu,
          message,
        )

        const mappedCommands = FoldkitCommand.mapMessages(commands, (message) =>
          GotThemeMenuMessage({ message }),
        )

        return Option.match(outMessage, {
          onNone: () =>
            [evo(model, { menu: () => nextMenu }), mappedCommands] as const,
          onSome: Match.type<Menu.OutMessage<ThemePreference>>().pipe(
            Match.tagsExhaustive({
              Selected: ({ value }) => {
                const resolvedTheme = resolveTheme({
                  preferredTheme: value,
                  systemTheme: model.systemTheme,
                })

                return [
                  evo(model, {
                    menu: () => nextMenu,
                    resolvedTheme: () => resolvedTheme,
                    preferredTheme: () => value,
                  }),
                  [
                    ...mappedCommands,
                    PersistThemePreference({ preference: value }),
                  ],
                ] as const
              },
            }),
          ),
        })
      },
      SelectedThemePreference: ({ preference }) => {
        const resolvedTheme = resolveTheme({
          preferredTheme: preference,
          systemTheme: model.systemTheme,
        })

        return [
          evo(model, {
            preferredTheme: () => preference,
            resolvedTheme: () => resolvedTheme,
          }),
          [PersistThemePreference({ preference })],
        ]
      },
    }),
    Match.tag("CompletedApplyTheme", "CompletedSaveThemePreference", () => [
      model,
      [],
    ]),
    Match.exhaustive,
  )
