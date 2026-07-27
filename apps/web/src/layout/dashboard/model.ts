import { Schema as S } from "effect"

export const Model = S.Struct({
  isSidebarOpen: S.Boolean,
})
export type Model = typeof Model.Type
