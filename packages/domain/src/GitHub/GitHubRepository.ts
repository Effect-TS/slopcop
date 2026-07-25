import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import * as Model from "effect/unstable/schema/Model"
import { lifecycleTimestamps } from "../Shared/Timestamps.ts"

export const GitHubRepositorySlug = Schema.Struct({
  owner: Schema.NonEmptyString,
  repo: Schema.NonEmptyString,
}).annotate({ identifier: "RepositorySlug" })
export type GitHubRepositorySlug = typeof GitHubRepositorySlug.Type

export const GitHubRepositorySlugFromString = Schema.TemplateLiteralParser([
  Schema.NonEmptyString,
  Schema.Literal("/"),
  Schema.NonEmptyString,
]).pipe(
  Schema.decodeTo(GitHubRepositorySlug, {
    decode: SchemaGetter.transform(([owner, _, repo]) => ({ owner, repo })),
    encode: SchemaGetter.transform(({ owner, repo }) => [owner, "/", repo]),
  }),
)
export type GitHubRepositorySlugFromString =
  typeof GitHubRepositorySlugFromString.Type

const GitHubIdString = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/))
const GitHubIdNumber = Schema.Int.check(Schema.isGreaterThan(0))

export const GitHubRepositoryExternalId = GitHubIdString.pipe(
  Schema.brand("GitHubRepositoryExternalId"),
)
export type GitHubRepositoryExternalId = typeof GitHubRepositoryExternalId.Type

const GitHubRepositoryExternalIdFromNumber = GitHubIdNumber.pipe(
  Schema.decodeTo(GitHubRepositoryExternalId, {
    decode: SchemaGetter.transform(String),
    encode: SchemaGetter.transform(Number),
  }),
)

export const GitHubRepositoryExternalIdFromJson = Schema.Union([
  GitHubRepositoryExternalId,
  GitHubRepositoryExternalIdFromNumber,
])

export const GitHubInstallationId = GitHubIdString.pipe(
  Schema.brand("GitHubInstallationId"),
)
export type GitHubInstallationId = typeof GitHubInstallationId.Type

const GitHubInstallationIdFromNumber = GitHubIdNumber.pipe(
  Schema.decodeTo(GitHubInstallationId, {
    decode: SchemaGetter.transform(String),
    encode: SchemaGetter.transform(Number),
  }),
)

export const GitHubInstallationIdFromJson = Schema.Union([
  GitHubInstallationId,
  GitHubInstallationIdFromNumber,
])

export const GitHubRepositoryId = Schema.NonEmptyString.pipe(
  Schema.brand("GitHubRepositoryId"),
)

export class GitHubRepository extends Model.Class<GitHubRepository>(
  "GitHubRepository",
)({
  id: Model.UuidV7Insert(GitHubRepositoryId),
  githubId: GitHubRepositoryExternalId,
  owner: Schema.NonEmptyString,
  repo: Schema.NonEmptyString,
  installationId: GitHubInstallationId,
  enabled: Model.BooleanSqlite,
  rulesRevision: Schema.Int,
  ...lifecycleTimestamps,
}) {
  get slug(): string {
    return this.owner + "/" + this.repo
  }
}
