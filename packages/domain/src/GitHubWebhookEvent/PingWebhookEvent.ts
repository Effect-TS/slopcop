import * as Schema from "effect/Schema"
import { BaseWebhookEvent } from "./BaseWebhookEvent.ts"

export const PingWebhookPayload = Schema.Struct({
  hook_id: Schema.Finite,
  zen: Schema.String,
})
export type PingWebhookPayload = typeof PingWebhookPayload.Type

export const PingWebhookEvent = Schema.Struct({
  ...BaseWebhookEvent.fields,
  name: Schema.Literal("ping"),
  payload: PingWebhookPayload,
})
export type PingWebhookEvent = typeof PingWebhookEvent.Type
