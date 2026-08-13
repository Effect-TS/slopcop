import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import * as GitHubRepository from "./GitHubRepository.ts"

export const GitHubDatasetSyncStatus = Schema.Literals([
  "pending",
  "refreshing",
  "ready",
  "failed",
])
export type GitHubDatasetSyncStatus = typeof GitHubDatasetSyncStatus.Type

const fields = {
  repositoryId: GitHubRepository.GitHubRepositoryId,
  status: GitHubDatasetSyncStatus,
  etag: Schema.NullOr(Schema.String),
  lastModified: Schema.NullOr(Schema.String),
  lastAttemptAt: Schema.NullOr(Schema.DateTimeUtcFromMillis),
  lastSuccessAt: Schema.NullOr(Schema.DateTimeUtcFromMillis),
  nextRefreshAt: Schema.DateTimeUtcFromMillis,
  consecutiveFailures: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  lastError: Schema.NullOr(Schema.String),
} as const

export class GitHubRepositoryLabelSync extends Model.Class<GitHubRepositoryLabelSync>(
  "GitHubRepositoryLabelSync",
)(fields) {}

export class GitHubPullRequestSync extends Model.Class<GitHubPullRequestSync>(
  "GitHubPullRequestSync",
)(fields) {}
