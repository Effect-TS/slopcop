import * as Schema from "effect/Schema"
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import { InvalidWebhookSignature } from "./Errors.ts"

export class EventQueueUnavailable extends Schema.TaggedErrorClass<EventQueueUnavailable>()(
  "EventQueueUnavailable",
  {},
  { httpApiStatus: 503 },
) {}

export class GitHubWebhookMiddleware extends HttpApiMiddleware.Service<GitHubWebhookMiddleware>()(
  "@slopcop/api/GitHubWebhookMiddleware",
  { error: [HttpApiError.BadRequest, InvalidWebhookSignature] },
) {}
