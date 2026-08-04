import type { Html } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import * as Match from "effect/Match"
import { type Message, GotThemeMenuMessage } from "./message"
import * as Icon from "../icon"
import { type Model, ThemeMenu, ThemePreference } from "./model"

const menuItemIcon = (item: ThemePreference): Html =>
  Match.value(item).pipe(
    Match.when("Dark", () => Icon.moon()),
    Match.when("Light", () => Icon.sun()),
    Match.when("System", () => Icon.computer()),
    Match.exhaustive,
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.submodel({
    slotId: "theme-switcher-menu",
    model: model.menu,
    view: ThemeMenu.view,
    toParentMessage: (message) => GotThemeMenuMessage({ message }),
    viewInputs: {
      items: ThemePreference.literals,
      anchor: { placement: "bottom-end", gap: 4, padding: 8 },
      ariaLabel: "Theme",
      buttonContent: menuItemIcon(model.resolvedTheme),
      buttonClassName:
        "px-3 py-3 hover:bg-muted dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg cursor-pointer rounded-lg cursor-pointer transition-colors",
      itemsClassName:
        "w-full max-w-36 cursor-pointer rounded-md bg-card py-1 ring ring-border",
      itemToConfig: (item) => ({
        content: h.div(
          [
            h.Class(
              "flex gap-2 items-center px-3 py-2 bg-card hover:bg-muted dark:hover:bg-input/50 transition-colors",
            ),
          ],
          [
            menuItemIcon(item),
            h.span([h.Class("flex-1")], [item]),
            model.preferredTheme === item
              ? h.span([], [Icon.check()])
              : h.empty,
          ],
        ),
      }),
      backdropClassName: "fixed inset-0",
    },
  }),
)
