import * as Schema from "effect/Schema"

export const GitHubWebhookDeliveryId = Schema.NonEmptyString.pipe(
  Schema.brand("GitHubWebhookDeliveryId"),
)
export type GitHubWebhookDeliveryId = typeof GitHubWebhookDeliveryId.Type
