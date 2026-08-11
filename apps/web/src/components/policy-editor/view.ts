import type { Html } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import type { Message } from "./message"
import type { Model } from "./model"
import { MountPolicyEditor } from "./mount"

export const view = Submodel.defineView<Model, Message>(
  (model, h): Html =>
    h.div(
      [],
      [
        h.div(
          [
            h.Id(model.id),
            h.Class("overflow-hidden rounded-lg border bg-background"),
            h.OnMount(
              MountPolicyEditor({
                id: model.id,
                initialSource: model.source,
                references: model.references,
              }),
            ),
          ],
          [],
        ),
        ...(model.error === null
          ? [
              h.p(
                [h.Class("mt-2 text-xs text-muted-foreground")],
                ["Valid pull request policy JSON."],
              ),
            ]
          : [
              h.p(
                [h.Role("alert"), h.Class("mt-2 text-xs text-destructive")],
                [model.error],
              ),
            ]),
      ],
    ),
)
