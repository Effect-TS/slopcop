import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Schema as S } from "effect"

export const RepositoriesNotAsked = S.TaggedStruct("NotAsked", {})
export const RepositoriesLoading = S.TaggedStruct("Loading", {})
export const RepositoriesFailed = S.TaggedStruct("Failed", {
  message: S.String,
})
export const RepositoriesReady = S.TaggedStruct("Ready", {
  repositories: S.Array(RepositoryManagement.RepositorySummary),
  pendingPatrols: S.Array(RepositoryManagement.RepositoryPath),
})

export const RepositoriesState = S.Union([
  RepositoriesNotAsked,
  RepositoriesLoading,
  RepositoriesFailed,
  RepositoriesReady,
])
export type RepositoriesState = typeof RepositoriesState.Type

export const NoPatrolNotice = S.TaggedStruct("NoPatrolNotice", {})
export const PatrolUpdateFailed = S.TaggedStruct("PatrolUpdateFailed", {
  repository: RepositoryManagement.RepositoryPath,
  message: S.String,
})
export const PatrolNotice = S.Union([NoPatrolNotice, PatrolUpdateFailed])

export const Model = S.Struct({
  query: S.String,
  repositories: RepositoriesState,
  patrolNotice: PatrolNotice,
})
export type Model = typeof Model.Type
