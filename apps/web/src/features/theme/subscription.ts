import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import * as Subscription from "foldkit/subscription"
import { applyTheme } from "./command"
import { THEME_MEDIA_QUERY } from "./constants"
import { ChangedSystemTheme, type Message } from "./message"
import { Theme, type Model } from "./model"

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  documentTheme: entry(
    { resolvedTheme: Theme },
    {
      modelToDependencies: (model) => ({
        resolvedTheme: model.resolvedTheme,
      }),
      dependenciesToStream: ({ resolvedTheme }) =>
        Stream.callback<Message>(() => applyTheme(resolvedTheme)),
    },
  ),
  systemTheme: Subscription.persistent(
    Stream.callback<Message>(
      Effect.fnUntraced(function* (queue) {
        const mediaQuery = globalThis.window.matchMedia(THEME_MEDIA_QUERY)

        const publish = (isDark: boolean) => {
          const theme: Theme = isDark ? "Dark" : "Light"
          const message = ChangedSystemTheme({ theme })
          Queue.offerUnsafe(queue, message)
        }

        const onChange = (event: MediaQueryListEvent) => {
          publish(event.matches)
        }

        // Reconcile any changes that occurred after flags were read
        publish(mediaQuery.matches)

        mediaQuery.addEventListener("change", onChange)
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => mediaQuery.removeEventListener("change", onChange)),
        )

        return yield* Effect.void
      }),
    ),
  ),
}))
