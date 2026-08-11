import type { Model } from "./model"

export const init = (input: {
  readonly id: string
  readonly source: string
}): Model => ({
  id: input.id,
  source: input.source,
  mountStatus: "Mounting",
  mountError: null,
})
