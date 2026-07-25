import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"

export const lifecycleTimestamps = {
  createdAt: Model.DateTimeInsertFromNumber,
  updatedAt: Model.DateTimeUpdateFromNumber,
  deletedAt: Schema.OptionFromNullOr(Schema.DateTimeUtcFromMillis).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
}
