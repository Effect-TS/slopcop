import * as Schema from "effect/Schema"
import { BaseWebhookEvent } from "./GitHubCommon.ts"
import { BasePullRequestPayload } from "./GitHubPullRequest.ts"

const Payload = Schema.Struct({
  action: Schema.Literals(["requested", "rerequested", "completed"]),
  check_suite: Schema.Struct({
    head_sha: Schema.String,
  }),
  repository: BasePullRequestPayload.fields.repository,
  installation: BasePullRequestPayload.fields.installation,
})

export const CheckSuiteWebhookEvent = Schema.Struct({
  ...BaseWebhookEvent.fields,
  name: Schema.Literal("check_suite"),
  payload: Payload,
})
export type CheckSuiteWebhookEvent = typeof CheckSuiteWebhookEvent.Type
