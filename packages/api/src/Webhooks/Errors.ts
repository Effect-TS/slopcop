import * as Schema from "effect/Schema"

export class InvalidWebhookSignature extends Schema.TaggedErrorClass<InvalidWebhookSignature>()(
  "InvalidWebhookSignature",
  {},
  { httpApiStatus: 401 },
) {}
