import * as Schema from "effect/Schema"
import { PingWebhookEvent } from "./WebhookEvent/GitHubPing.ts"
import { PullRequestWebhookEvent } from "./WebhookEvent/GitHubPullRequest.ts"

export const GitHubWebhookEvent = Schema.Union([
  PingWebhookEvent,
  PullRequestWebhookEvent,
]).pipe(Schema.toTaggedUnion("name"))
export type GitHubWebhookEvent = typeof GitHubWebhookEvent.Type

export const GitHubWebhookEventName = Schema.Literals(
  GitHubWebhookEvent.discriminants,
)
export type GitHubWebhookEventName = typeof GitHubWebhookEventName.Type
