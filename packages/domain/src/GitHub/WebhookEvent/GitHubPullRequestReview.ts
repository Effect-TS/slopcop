import * as Schema from "effect/Schema"
import { BaseWebhookEvent } from "./GitHubCommon.ts"
import { BasePullRequestPayload, PullRequest } from "./GitHubPullRequest.ts"

const Payload = Schema.Struct({
  action: Schema.Literals(["submitted", "dismissed"]),
  pull_request: Schema.Struct({
    ...PullRequest.fields,
    number: Schema.Finite,
  }),
  repository: BasePullRequestPayload.fields.repository,
  installation: BasePullRequestPayload.fields.installation,
})

export const PullRequestReviewWebhookEvent = Schema.Struct({
  ...BaseWebhookEvent.fields,
  name: Schema.Literal("pull_request_review"),
  payload: Payload,
})
export type PullRequestReviewWebhookEvent =
  typeof PullRequestReviewWebhookEvent.Type
