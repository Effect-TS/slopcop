import * as Schema from "effect/Schema"
import { BaseWebhookEvent } from "./GitHubCommon.ts"
import { BasePullRequestPayload } from "./GitHubPullRequest.ts"

const Payload = Schema.Struct({
  sha: Schema.String,
  state: Schema.Literals(["error", "failure", "pending", "success"]),
  repository: BasePullRequestPayload.fields.repository,
  installation: BasePullRequestPayload.fields.installation,
})

export const StatusWebhookEvent = Schema.Struct({
  ...BaseWebhookEvent.fields,
  name: Schema.Literal("status"),
  payload: Payload,
})
export type StatusWebhookEvent = typeof StatusWebhookEvent.Type
