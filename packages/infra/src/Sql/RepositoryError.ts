import * as Data from "effect/Data"
import type { SchemaError } from "effect/Schema"
import type { SqlError } from "effect/unstable/sql/SqlError"

export class UnexpectedRowCount extends Data.TaggedError("UnexpectedRowCount")<{
  readonly expected: number
  readonly actual: number
}> {}

export type RepositoryErrorCause = SqlError | SchemaError | UnexpectedRowCount
