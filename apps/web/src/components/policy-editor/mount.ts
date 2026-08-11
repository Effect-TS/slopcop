import { Effect, Queue, Schema, Stream } from "effect"
import { Mount } from "foldkit"
import { EditedSource, FailedToMountEditor, MountedEditor } from "./message"
import { PolicyReference } from "./model"

export const MountPolicyEditor = Mount.defineStream(
  "MountPolicyEditor",
  {
    id: Schema.String,
    initialSource: Schema.String,
    references: Schema.Array(PolicyReference),
  },
  MountedEditor,
  FailedToMountEditor,
  EditedSource,
)(
  ({ initialSource, references }) =>
    (element) =>
      Stream.callback((queue) =>
        Effect.acquireRelease(
          Effect.tryPromise({
            try: async () => {
              if (!(element instanceof HTMLElement))
                throw new Error("Policy editor host must be an HTMLElement.")
              const { createPolicyEditor } = await import("./editor")
              const editor = createPolicyEditor({
                element,
                initialSource,
                references,
                onChange: (source) => {
                  Queue.offerUnsafe(queue, EditedSource({ source }))
                },
              })
              Queue.offerUnsafe(queue, MountedEditor())
              return editor
            },
            catch: (error) =>
              error instanceof Error
                ? error.message
                : "The policy editor failed to mount.",
          }),
          (editor) => Effect.sync(() => editor.destroy()),
        ).pipe(
          Effect.flatMap(() => Effect.never),
          Effect.catch((reason) =>
            Effect.sync(() => {
              Queue.offerUnsafe(queue, FailedToMountEditor({ reason }))
            }),
          ),
        ),
      ),
)
