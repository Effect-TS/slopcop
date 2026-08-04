import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import { THEME_STORAGE_KEY } from "./constants"
import { Theme, ThemePreference } from "./model"

export const Flags = Schema.Struct({
  preferredTheme: ThemePreference,
  systemTheme: Theme,
})
export type Flags = typeof Flags.Type

export const flags = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  const themeStore = KeyValueStore.toSchemaStore(store, ThemePreference)

  const preferredTheme = yield* themeStore
    .get(THEME_STORAGE_KEY)
    .pipe(Effect.orElseSucceed(() => Option.none<ThemePreference>()))

  const systemTheme: Theme = yield* Effect.sync(() =>
    globalThis.window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "Dark"
      : "Light",
  )

  return Flags.make(
    {
      preferredTheme: Option.getOrElse(preferredTheme, () => "System"),
      systemTheme,
    },
    { disableChecks: true },
  )
})
