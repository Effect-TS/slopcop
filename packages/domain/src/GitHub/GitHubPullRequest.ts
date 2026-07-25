import * as Schema from "effect/Schema"
import * as GitHubRepository from "./GitHubRepository.ts"

export const MAX_FILES = 100
export const MAX_PATCH_CHARS_PER_FILE = 4_000
export const MAX_TOTAL_PATCH_CHARS = 40_000

export const GitHubPullRequestFileStatus = Schema.Literals([
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
  "unchanged",
])
export type GitHubPullRequestFileStatus =
  typeof GitHubPullRequestFileStatus.Type

export const GitHubPullRequestFile = Schema.Struct({
  filename: Schema.String,
  status: GitHubPullRequestFileStatus,
  patch: Schema.optionalKey(Schema.String),
})
export type GitHubPullRequestFile = typeof GitHubPullRequestFile.Type

export const ChangedFileEvidence = Schema.Struct({
  filename: Schema.String,
  status: GitHubPullRequestFileStatus,
  patch: Schema.NullOr(Schema.String),
  patchOmission: Schema.NullOr(
    Schema.Literals(["unavailable", "per-file-limit", "total-limit"]),
  ),
})
export type ChangedFileEvidence = typeof ChangedFileEvidence.Type

export const PullRequestEvidence = Schema.Struct({
  type: Schema.Literal("pull_request"),
  number: Schema.Int,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  baseRef: Schema.String,
  headSha: Schema.String,
  files: Schema.Array(ChangedFileEvidence),
  filesTruncated: Schema.Boolean,
})
export type PullRequestEvidence = typeof PullRequestEvidence.Type

export const GitHubPullRequest = Schema.Struct({
  deliveryId: Schema.String,
  repository: GitHubRepository.GitHubRepository,
  number: Schema.Int,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  baseRef: Schema.String,
  headSha: Schema.String,
})
export type GitHubPullRequest = typeof GitHubPullRequest.Type
