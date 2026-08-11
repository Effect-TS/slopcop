import * as Schema from "effect/Schema"
import { BaseWebhookEvent } from "./GitHubCommon.ts"
import { BasePullRequestPayload } from "./GitHubPullRequest.ts"

const Payload = Schema.Struct({
  action: Schema.Literals(["created", "rerequested", "completed"]),
  check_run: Schema.Struct({
    head_sha: Schema.String,
  }),
  repository: BasePullRequestPayload.fields.repository,
  installation: BasePullRequestPayload.fields.installation,
})

export const CheckRunWebhookEvent = Schema.Struct({
  ...BaseWebhookEvent.fields,
  name: Schema.Literal("check_run"),
  payload: Payload,
})
export type CheckRunWebhookEvent = typeof CheckRunWebhookEvent.Type
