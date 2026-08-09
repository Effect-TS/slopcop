import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as Schema from "effect/Schema"

export const SaveIdle = Schema.TaggedStruct("SaveIdle", {})
export const SaveSaving = Schema.TaggedStruct("SaveSaving", {
  requestId: Schema.Int,
  enabled: Schema.Boolean,
})
export const SaveFailed = Schema.TaggedStruct("SaveFailed", {
  message: Schema.NonEmptyString,
})
export const SaveState = Schema.Union([SaveIdle, SaveSaving, SaveFailed]).pipe(
  Schema.toTaggedUnion("_tag"),
)
export type SaveState = typeof SaveState.Type

export const Model = Schema.Struct({
  repository: Schema.NullOr(RepositoryManagement.RepositorySummary),
  enabled: Schema.Boolean,
  saveState: SaveState,
  nextRequestId: Schema.Int,
})
export type Model = typeof Model.Type
