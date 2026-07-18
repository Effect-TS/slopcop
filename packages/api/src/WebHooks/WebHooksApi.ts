import * as Schema from "effect/Schema"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import { GitHubWebHookMiddleware } from "./GitHub.ts"

export const GitHubWebHookHeaders = Schema.Struct({
  "x-github-delivery": Schema.String,
  "x-github-event": Schema.String,
})

export class WebHooksApi extends HttpApiGroup.make("webhooks")
  .add(
    HttpApiEndpoint.post("github", "/github", {
      headers: GitHubWebHookHeaders,
      payload: Schema.Unknown, // TODO
      success: HttpApiSchema.Accepted,
    }).middleware(GitHubWebHookMiddleware),
  )
  .prefix("/webhooks") {}
