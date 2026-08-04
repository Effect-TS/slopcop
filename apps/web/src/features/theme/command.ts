import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import * as FoldkitCommand from "foldkit/command"
import { CompletedApplyTheme, CompletedSaveThemePreference } from "./message"
import { THEME_STORAGE_KEY } from "./constants"
import type { Message } from "./message"
import { Theme, ThemePreference } from "./model"

export type Command = FoldkitCommand.Command<
  Message,
  never,
  KeyValueStore.KeyValueStore
>

export const applyTheme = (theme: Theme): Effect.Effect<void> =>
  Effect.sync(() => {
    globalThis.document.documentElement.classList.toggle(
      "dark",
      theme === "Dark",
    )
  })

export const ApplyTheme = FoldkitCommand.define("ApplyTheme", {
  args: { theme: Theme },
  messages: [CompletedApplyTheme],
  execute: ({ theme }) => Effect.as(applyTheme(theme), CompletedApplyTheme()),
})

export const PersistThemePreference = FoldkitCommand.define(
  "PersistThemePreference",
  {
    args: { preference: ThemePreference },
    messages: [CompletedSaveThemePreference],
    execute: Effect.fnUntraced(
      function* ({ preference }) {
        const store = yield* KeyValueStore.KeyValueStore
        const themeStore = KeyValueStore.toSchemaStore(store, ThemePreference)
        yield* themeStore.set(THEME_STORAGE_KEY, preference)
        return CompletedSaveThemePreference()
      },
      Effect.orElseSucceed(() => CompletedSaveThemePreference()),
    ),
  },
)
