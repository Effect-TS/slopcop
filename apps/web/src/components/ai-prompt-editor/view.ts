import * as AiPromptTemplate from "@slopcop/domain/Labeling/AiPromptTemplate"
import type * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import type { Html } from "foldkit/html"
import * as Submodel from "foldkit/submodel"
import type { Message } from "./message"
import type { Model } from "./model"
import { MountAiPromptEditor } from "./mount"

export type ViewInputs = Readonly<{
  availableFacts: ReadonlyArray<PolicyProgram.PullRequestFact>
}>

export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, inputs, h): Html => {
    const validation = AiPromptTemplate.validate(
      model.source,
      inputs.availableFacts,
    )
    return h.div(
      [],
      [
        h.div(
          [
            h.Id(model.id),
            h.DataAttribute(
              "available-facts",
              JSON.stringify(inputs.availableFacts),
            ),
            h.Class(
              "overflow-hidden rounded-lg border bg-background transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
            ),
            h.OnMount(
              MountAiPromptEditor({
                id: model.id,
                initialSource: model.source,
              }),
            ),
          ],
          [],
        ),
        ...(model.mountError !== null
          ? [
              h.p(
                [h.Role("alert"), h.Class("mt-2 text-xs text-destructive")],
                [model.mountError],
              ),
            ]
          : validation._tag === "Invalid"
            ? [
                h.p(
                  [h.Role("alert"), h.Class("mt-2 text-xs text-destructive")],
                  [validation.message],
                ),
              ]
            : []),
      ],
    )
  },
)
