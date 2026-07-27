import * as Schema from "effect/Schema"
import { GitHubRepositorySlug } from "./GitHubRepository.ts"

export const RepositoryPath = GitHubRepositorySlug
export type RepositoryPath = typeof RepositoryPath.Type

export const RepositorySummary = Schema.Struct({
  owner: Schema.NonEmptyString,
  repo: Schema.NonEmptyString,
  enabled: Schema.Boolean,
})
export type RepositorySummary = typeof RepositorySummary.Type

export const ListRepositoriesResponse = Schema.Struct({
  repositories: Schema.Array(RepositorySummary),
})

export const UpdateRepositoryEnabledRequest = Schema.Struct({
  enabled: Schema.Boolean,
})
export type UpdateRepositoryEnabledRequest =
  typeof UpdateRepositoryEnabledRequest.Type
