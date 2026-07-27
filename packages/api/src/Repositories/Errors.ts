import * as Schema from "effect/Schema"

export class RepositoryNotFound extends Schema.TaggedErrorClass<RepositoryNotFound>()(
  "RepositoryNotFound",
  { repository: Schema.String, message: Schema.String },
  { httpApiStatus: 404 },
) {}
