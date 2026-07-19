import * as Schema from "effect/Schema"
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"

export class InvalidGitHubWebHookSignature extends Schema.TaggedErrorClass<InvalidGitHubWebHookSignature>()(
  "InvalidGitHubWebHookSignature",
  {},
  { httpApiStatus: 401 },
) {}

export class WebhookQueueUnavailable extends Schema.TaggedErrorClass<WebhookQueueUnavailable>()(
  "WebhookQueueUnavailable",
  {},
  { httpApiStatus: 503 },
) {}

export class GitHubWebHookMiddleware extends HttpApiMiddleware.Service<GitHubWebHookMiddleware>()(
  "@effect/triage/GitHubWebHookMiddleware",
  { error: [HttpApiError.BadRequest, InvalidGitHubWebHookSignature] },
) {}
