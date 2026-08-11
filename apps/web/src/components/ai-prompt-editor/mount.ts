import { Effect, Queue, Schema, Stream } from "effect"
import { Mount } from "foldkit"
import { EditedSource, FailedToMountEditor, MountedEditor } from "./message"

export const MountAiPromptEditor = Mount.defineStream(
  "MountAiPromptEditor",
  { id: Schema.String, initialSource: Schema.String },
  MountedEditor,
  FailedToMountEditor,
  EditedSource,
)(
  ({ initialSource }) =>
    (element) =>
      Stream.callback((queue) =>
        Effect.acquireRelease(
          Effect.tryPromise({
            try: async () => {
              if (!(element instanceof HTMLElement))
                throw new Error("AI prompt editor host must be an HTMLElement.")
              const { createAiPromptEditor } = await import("./editor")
              const editor = createAiPromptEditor({
                element,
                initialSource,
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
                : "The AI prompt editor failed to mount.",
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
