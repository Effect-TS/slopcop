import * as Schema from "effect/Schema"

export class GitHubWebHookEvent extends Schema.Class<GitHubWebHookEvent>(
  "GitHubWebHookEvent",
)({
  deliveryId: Schema.String,
  eventName: Schema.String,
  payload: Schema.Json,
}) {}
