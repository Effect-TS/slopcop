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

export const GitHubDataSyncStatus = Schema.Struct({
  status: Schema.Literals(["pending", "refreshing", "ready", "failed"]),
  lastAttemptAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastSuccessAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  nextRefreshAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  failedDatasets: Schema.Int,
  refreshingDatasets: Schema.Int,
})
export type GitHubDataSyncStatus = typeof GitHubDataSyncStatus.Type

export const GitHubDataSyncAccepted = Schema.Struct({
  accepted: Schema.Boolean,
})
