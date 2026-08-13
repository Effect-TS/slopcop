import type { EntryHandlers, Variant } from "@foldkit/ui/toast"
import * as Match from "effect/Match"
import type { Html } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import * as Icon from "../icon"
import { GotToastMessage, RequestedSync, type Message } from "./message"
import type { Model } from "./model"
import { Toast } from "./toast"

const toastClass = (variant: Variant): string =>
  Match.value(variant).pipe(
    Match.when("Success", () => "border-success/30"),
    Match.when("Error", () => "border-destructive/40"),
    Match.orElse(() => "border-border"),
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [],
    [
      h.button(
        [
          h.Type("button"),
          h.AriaLabel("Synchronize GitHub data"),
          h.Class(
            "px-3 py-3 hover:bg-muted dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg cursor-pointer transition-colors disabled:cursor-wait disabled:opacity-60",
          ),
          ...(model.state === "idle"
            ? [h.OnClick(RequestedSync())]
            : [h.Disabled(true)]),
        ],
        [
          Icon.refresh(
            `size-4 ${model.state === "idle" ? "" : "animate-spin"}`,
          ),
        ],
      ),
      h.submodel({
        slotId: model.toast.id,
        model: model.toast,
        view: Toast.view,
        viewInputs: {
          position: "BottomRight",
          ariaLabel: "GitHub synchronization notifications",
          containerClassName: "z-50 p-4",
          entryClassName:
            "w-[min(26rem,calc(100vw-2rem))] transition duration-200 data-closed:translate-x-4 data-closed:opacity-0 data-transition:transition",
          entryToView: (entry, handlers: EntryHandlers): Html =>
            h.div(
              [
                h.Class(
                  `rounded-xl border bg-card p-4 text-sm text-foreground shadow-lg ${toastClass(entry.variant)}`,
                ),
              ],
              [
                h.div(
                  [h.Class("flex items-start gap-3")],
                  [
                    h.div(
                      [h.Class("min-w-0 flex-1")],
                      [
                        h.p([h.Class("font-medium")], [entry.payload.title]),
                        h.p(
                          [h.Class("mt-1 text-muted-foreground")],
                          [entry.payload.detail],
                        ),
                      ],
                    ),
                    h.button(
                      [
                        ...handlers.dismiss,
                        h.Type("button"),
                        h.AriaLabel("Dismiss notification"),
                        h.Class("rounded-md px-2 py-1 text-xs hover:bg-accent"),
                      ],
                      ["Dismiss"],
                    ),
                  ],
                ),
              ],
            ),
        },
        toParentMessage: (message) => GotToastMessage({ message }),
      }),
    ],
  ),
)
