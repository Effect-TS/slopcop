import * as Schema from "effect/Schema"
import { GitHubWebhookDeliveryId } from "../GitHubWebhookDelivery.ts"

export const BaseWebhookEvent = Schema.Struct({
  id: GitHubWebhookDeliveryId,
})
export type BaseWebhookEvent = typeof BaseWebhookEvent.Type
