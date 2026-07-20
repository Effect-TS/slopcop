import { WebhookEventName } from "@slopcop/domain/GitHubWebhookEvent"
import * as Schema from "effect/Schema"

const Current = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  payload: Schema.Json,
})

const Legacy = Schema.Struct({
  deliveryId: Schema.String,
  eventName: Schema.String,
  payload: Schema.Json,
})

const schema = Schema.Union([Current, Legacy])

export type GitHubWebhookQueueMessage = typeof schema.Type

export const GitHubWebhookQueueMessage = {
  schema,
  isSupported: Schema.is(WebhookEventName),
  normalize(message: GitHubWebhookQueueMessage) {
    return "id" in message
      ? message
      : {
          id: message.deliveryId,
          name: message.eventName,
          payload: message.payload,
        }
  },
} as const
