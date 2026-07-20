import * as Schema from "effect/Schema"
import { PingWebhookEvent } from "./GitHubWebhookEvent/PingWebhookEvent.ts"
import { PullRequestWebhookEvent } from "./GitHubWebhookEvent/PullRequestWebhookEvent.ts"

export const GitHubWebhookEvent = Schema.Union([
  PingWebhookEvent,
  PullRequestWebhookEvent,
]).pipe(Schema.toTaggedUnion("name"))

export type GitHubWebhookEvent = typeof GitHubWebhookEvent.Type

export const WebhookEventName = GitHubWebhookEvent.mapMembers((members) =>
  members.map((member) => member.fields.name),
)
export type WebhookEventName = typeof WebhookEventName.Type
