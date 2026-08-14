import * as Schema from "effect/Schema"
import * as GitHubRepository from "./GitHubRepository.ts"

export const GitHubDataSyncTrigger = Schema.Literals([
  "scheduled",
  "manual",
  "stale-read",
])
export type GitHubDataSyncTrigger = typeof GitHubDataSyncTrigger.Type

export const SyncAllGitHubData = Schema.TaggedStruct("SyncAllGitHubData", {
  trigger: GitHubDataSyncTrigger,
  force: Schema.Boolean,
})

export const SyncRepositoryGitHubData = Schema.TaggedStruct(
  "SyncRepositoryGitHubData",
  {
    repositoryId: GitHubRepository.GitHubRepositoryId,
    trigger: GitHubDataSyncTrigger,
    force: Schema.Boolean,
  },
)

export const GitHubDataSyncJob = Schema.Union([
  SyncAllGitHubData,
  SyncRepositoryGitHubData,
])
export type GitHubDataSyncJob = typeof GitHubDataSyncJob.Type
