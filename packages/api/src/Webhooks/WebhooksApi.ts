import * as Schema from "effect/Schema"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import { GitHubWebhookMiddleware, EventQueueUnavailable } from "./GitHub.ts"

export const GitHubWebhookHeaders = Schema.Struct({
  "x-github-delivery": Schema.String,
  "x-github-event": Schema.String,
})

export class WebhooksApi extends HttpApiGroup.make("webhooks")
  .add(
    HttpApiEndpoint.post("github", "/github", {
      headers: GitHubWebhookHeaders,
      payload: Schema.Json,
      success: HttpApiSchema.Accepted,
      error: EventQueueUnavailable,
    }).middleware(GitHubWebhookMiddleware),
  )
  .prefix("/webhooks") {}
