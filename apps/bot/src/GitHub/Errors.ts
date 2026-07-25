import * as Data from "effect/Data"

export class RepositoryNotConfigured extends Data.TaggedError(
  "RepositoryNotConfigured",
)<{
  readonly repository: string
}> {}
