import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import * as Model from "effect/unstable/schema/Model"
import { lifecycleTimestamps } from "../Shared/Timestamps.ts"
import {
  GitHubInstallationId,
  GitHubInstallationIdFromJson,
  GitHubRepositoryExternalId,
  GitHubRepositoryExternalIdFromJson,
  GitHubRepositorySlugFromString,
} from "./GitHubRepository.ts"

const GitHubIdString = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/))
const GitHubIdNumber = Schema.Int.check(Schema.isGreaterThan(0))

export const GitHubAccountId = GitHubIdString.pipe(
  Schema.brand("GitHubAccountId"),
)
export type GitHubAccountId = typeof GitHubAccountId.Type

const GitHubAccountIdFromNumber = GitHubIdNumber.pipe(
  Schema.decodeTo(GitHubAccountId, {
    decode: SchemaGetter.transform(String),
    encode: SchemaGetter.transform(Number),
  }),
)

export const GitHubAccountIdFromJson = Schema.Union([
  GitHubAccountId,
  GitHubAccountIdFromNumber,
])

export const GitHubAccountType = Schema.Literals(["Organization", "User"])
export type GitHubAccountType = typeof GitHubAccountType.Type

export const GitHubRepositorySelection = Schema.Literals(["all", "selected"])
export type GitHubRepositorySelection = typeof GitHubRepositorySelection.Type

export const GitHubInstallationStatus = Schema.Literals(["active", "suspended"])
export type GitHubInstallationStatus = typeof GitHubInstallationStatus.Type

export const GitHubInstallationSyncStatus = Schema.Literals([
  "pending",
  "ready",
  "failed",
])
export type GitHubInstallationSyncStatus =
  typeof GitHubInstallationSyncStatus.Type

export class GitHubInstallation extends Model.Class<GitHubInstallation>(
  "GitHubInstallation",
)({
  githubId: Model.GeneratedByApp(GitHubInstallationId),
  accountId: GitHubAccountId,
  accountLogin: Schema.NonEmptyString,
  accountType: GitHubAccountType,
  repositorySelection: GitHubRepositorySelection,
  status: GitHubInstallationStatus,
  syncStatus: GitHubInstallationSyncStatus,
  htmlUrl: Schema.String,
  lastError: Schema.OptionFromNullOr(Schema.String).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  ...lifecycleTimestamps,
}) {}

export const GitHubInstallationSummary = Schema.Struct({
  id: GitHubInstallationIdFromJson,
  account: Schema.Struct({
    id: GitHubAccountIdFromJson,
    login: Schema.NonEmptyString,
    type: GitHubAccountType,
  }),
  repository_selection: GitHubRepositorySelection,
  html_url: Schema.String,
  suspended_at: Schema.NullOr(Schema.String),
})
export type GitHubInstallationSummary = typeof GitHubInstallationSummary.Type

export const DiscoveredRepository = Schema.Struct({
  githubId: GitHubRepositoryExternalId,
  owner: Schema.NonEmptyString,
  repo: Schema.NonEmptyString,
  isPrivate: Schema.Boolean,
})
export type DiscoveredRepository = typeof DiscoveredRepository.Type

export const GitHubInstallationRepository = Schema.Struct({
  id: GitHubRepositoryExternalIdFromJson,
  slug: GitHubRepositorySlugFromString,
  isPrivate: Schema.Boolean,
}).pipe(Schema.encodeKeys({ slug: "full_name", isPrivate: "private" }))
export type GitHubInstallationRepository =
  typeof GitHubInstallationRepository.Type

export const ListInstallationRepositoriesResponse = Schema.Struct({
  repositories: Schema.Array(GitHubInstallationRepository),
})
