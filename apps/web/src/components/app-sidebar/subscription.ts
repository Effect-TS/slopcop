import * as Sidebar from "@slopcop/ui/Sidebar"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import * as Subscription from "foldkit/subscription"
import * as Theme from "../../features/theme"
import { MOBILE_VIEWPORT_QUERY } from "./constants"
import { type Message, GotSidebarMessage, GotThemeMessage } from "./message"
import type { Model } from "./model"

const themeSubscriptions = Subscription.lift(Theme.subscriptions)<
  Model,
  Message
>({
  toChildModel: (model) => model.theme,
  toParentMessage: (message) => GotThemeMessage({ message }),
})

const localSubscriptions = Subscription.make<Model, Message>()(() => ({
  sidebarMode: Subscription.persistent(
    Stream.callback<Message>(
      Effect.fnUntraced(function* (queue) {
        const mediaQuery = globalThis.window.matchMedia(MOBILE_VIEWPORT_QUERY)

        const publish = (mode: Sidebar.Mode): void => {
          const message = GotSidebarMessage({
            message: Sidebar.ChangedMode({ mode }),
          })
          Queue.offerUnsafe(queue, message)
        }

        const onChange = (event: MediaQueryListEvent): void => {
          publish(event.matches ? "Mobile" : "Desktop")
        }

        // Reconcile any changes that occurred after flags were read
        publish(mediaQuery.matches ? "Mobile" : "Desktop")

        mediaQuery.addEventListener("change", onChange)
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => mediaQuery.removeEventListener("change", onChange)),
        )

        return yield* Effect.void
      }),
    ),
  ),
}))

export const subscriptions = Subscription.aggregate<Model, Message>()(
  themeSubscriptions,
  localSubscriptions,
)
