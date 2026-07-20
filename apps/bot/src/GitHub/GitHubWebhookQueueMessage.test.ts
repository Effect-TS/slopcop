import { GitHubWebhookEvent } from "@slopcop/domain/GitHubWebhookEvent"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import { GitHubWebhookQueueMessage } from "./GitHubWebhookQueueMessage.ts"

const decode = Schema.decodeUnknownSync(GitHubWebhookQueueMessage.schema)

describe("GitHubWebhookQueueMessage", () => {
  it("schema-encodes events into JSON-safe queue bodies", () => {
    const body = Schema.encodeSync(GitHubWebhookEvent)({
      id: "delivery-1",
      name: "ping",
      payload: {
        hook_id: 1,
        zen: "Keep it logically awesome.",
      },
    })

    expect(body).toEqual({
      id: "delivery-1",
      name: "ping",
      payload: {
        hook_id: 1,
        zen: "Keep it logically awesome.",
      },
    })
    expect(() => JSON.stringify(body)).not.toThrow()
  })

  it("normalizes legacy queue messages", () => {
    const message = GitHubWebhookQueueMessage.normalize(
      decode({
        deliveryId: "delivery-1",
        eventName: "check_suite",
        payload: { action: "requested" },
      }),
    )

    expect(message).toEqual({
      id: "delivery-1",
      name: "check_suite",
      payload: { action: "requested" },
    })
    expect(GitHubWebhookQueueMessage.isSupported(message.name)).toBe(false)
  })

  it("recognizes supported current queue messages", () => {
    const message = GitHubWebhookQueueMessage.normalize(
      decode({
        id: "delivery-2",
        name: "ping",
        payload: { hook_id: 1, zen: "Keep it logically awesome." },
      }),
    )

    expect(GitHubWebhookQueueMessage.isSupported(message.name)).toBe(true)
  })
})
