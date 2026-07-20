import * as Schema from "effect/Schema"

export const BaseWebhookEvent = Schema.Struct({
  id: Schema.String,
})
export type BaseWebhookEvent = typeof BaseWebhookEvent.Type
