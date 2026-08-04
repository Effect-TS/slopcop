import * as Schema from "effect/Schema"

export const AppNotInstalled = Schema.TaggedStruct("AppNotInstalled", {
  installationUrl: Schema.String,
})
export const Synchronizing = Schema.TaggedStruct("Synchronizing", {})
export const NoRepositoriesSelected = Schema.TaggedStruct(
  "NoRepositoriesSelected",
  { configurationUrl: Schema.String },
)
export const Ready = Schema.TaggedStruct("Ready", {})
export const SynchronizationFailed = Schema.TaggedStruct(
  "SynchronizationFailed",
  { message: Schema.String },
)

export const SetupStatus = Schema.Union([
  AppNotInstalled,
  Synchronizing,
  NoRepositoriesSelected,
  Ready,
  SynchronizationFailed,
])
export type SetupStatus = typeof SetupStatus.Type
