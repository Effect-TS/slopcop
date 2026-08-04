import * as Setup from "@slopcop/domain/GitHub/Setup"
import * as Schema from "effect/Schema"

export const LoadingSetup = Schema.TaggedStruct("LoadingSetup", {})
export type LoadingSetup = typeof LoadingSetup.Type

export const SetupRequestFailed = Schema.TaggedStruct("SetupRequestFailed", {
  message: Schema.NonEmptyString,
})
export type SetupRequestFailed = typeof SetupRequestFailed.Type

export const Model = Schema.Union([
  LoadingSetup,
  SetupRequestFailed,
  Setup.SetupStatus,
]).pipe(Schema.toTaggedUnion("_tag"))
export type Model = typeof Model.Type
