import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import { lifecycleTimestamps } from "../Shared/Timestamps.ts"
import { GitHubWebhookEventName } from "./GitHubWebhookEvent.ts"

export const GitHubEventId = Schema.NonEmptyString.pipe(
  Schema.brand("GitHubEventId"),
)
export type GitHubEventId = typeof GitHubEventId.Type

export const GitHubEventStatus = Schema.Literals([
  "pending",
  "processing",
  "completed",
])
export type GitHubEventStatus = typeof GitHubEventStatus.Type

export class GitHubEvent extends Model.Class<GitHubEvent>("GitHubEvent")({
  id: Model.GeneratedByApp(GitHubEventId),
  name: Model.GeneratedByApp(GitHubWebhookEventName),
  status: GitHubEventStatus.pipe(
    Schema.withConstructorDefault(Effect.succeed("pending")),
  ),
  attempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
    Schema.withConstructorDefault(Effect.succeed(0)),
  ),
  lastError: Schema.OptionFromNullOr(Schema.String).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  ...lifecycleTimestamps,
}) {}
