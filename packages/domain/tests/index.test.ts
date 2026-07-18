import { expect, test } from "vite-plus/test"
import { WebhookVerificationError } from "../src/index.ts"

test("represents a webhook verification failure", () => {
  const error = new WebhookVerificationError({
    reason: "SignatureMismatch",
    message: "The webhook signature does not match the request body",
  })

  expect(error._tag).toBe("WebhookVerificationError")
  expect(error.reason).toBe("SignatureMismatch")
})
