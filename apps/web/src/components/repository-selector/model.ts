import * as Command from "@slopcop/ui/Command"
import * as Popover from "@foldkit/ui/popover"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

export const RepositoriesLoading = Schema.TaggedStruct(
  "RepositoriesLoading",
  {},
)
export type RepositoriesLoading = typeof RepositoriesLoading.Type

export const RepositoriesLoaded = Schema.TaggedStruct("RepositoriesLoaded", {
  repositories: Schema.Array(RepositoryManagement.RepositorySummary),
})
export type RepositoriesLoaded = typeof RepositoriesLoaded.Type

export const RepositoriesFailed = Schema.TaggedStruct("RepositoriesFailed", {
  message: Schema.NonEmptyString,
})
export type RepositoriesFailed = typeof RepositoriesFailed.Type

export const RepositoryLoadState = Schema.Union([
  RepositoriesLoading,
  RepositoriesLoaded,
  RepositoriesFailed,
]).pipe(Schema.toTaggedUnion("_tag"))
export type RepositoryLoadState = typeof RepositoryLoadState.Type

export const Model = Schema.Struct({
  command: Command.Model,
  popover: Popover.Model,
  repositories: RepositoryLoadState,
  selected: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const repositoryValue = (repository: {
  readonly owner: string
  readonly repo: string
}): string => `${repository.owner}/${repository.repo}`

export const selectedRepository = (
  model: Model,
): Option.Option<RepositoryManagement.RepositorySummary> => {
  if (
    model.repositories._tag !== "RepositoriesLoaded" ||
    model.selected === null
  ) {
    return Option.none()
  }

  return Option.fromNullishOr(
    model.repositories.repositories.find(
      (repository) => repositoryValue(repository) === model.selected,
    ),
  )
}

export const reconcileSelectedRepository = (
  current: string | null,
  repositories: ReadonlyArray<RepositoryManagement.RepositorySummary>,
): string | null => {
  if (
    current !== null &&
    repositories.some((repository) => repositoryValue(repository) === current)
  ) {
    return current
  }

  const first = repositories[0]
  return first === undefined ? null : repositoryValue(first)
}
