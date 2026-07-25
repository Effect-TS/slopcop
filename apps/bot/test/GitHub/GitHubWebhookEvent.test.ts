import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

const decode = Schema.decodeUnknownOption(GitHubWebhookEvent.GitHubWebhookEvent)
const decodeResult = Schema.decodeUnknownResult(
  GitHubWebhookEvent.GitHubWebhookEvent,
)

describe("GitHubWebhookEvent", () => {
  it("normalizes GitHub repository and installation IDs to strings", () => {
    const event = Schema.decodeUnknownSync(
      GitHubWebhookEvent.GitHubWebhookEvent,
    )({
      id: "delivery-1",
      name: "pull_request",
      payload: {
        action: "opened",
        number: 42,
        pull_request: {
          id: 1,
          node_id: "PR_1",
          title: "Fix behavior",
          body: null,
          draft: false,
          user: { login: "octocat" },
          head: { sha: "abc123" },
          base: { ref: "main" },
        },
        repository: { id: 2, full_name: "Effect-TS/effect" },
        installation: { id: 3 },
      },
    })

    if (event.name !== "pull_request") throw new Error("Expected pull request")
    expect(event.payload.repository.id).toBe("2")
    expect(event.payload.installation.id).toBe("3")

    const encoded = Schema.encodeSync(GitHubWebhookEvent.GitHubWebhookEvent)(
      event,
    )
    if (encoded.name !== "pull_request")
      throw new Error("Expected pull request")
    expect(encoded.payload.repository.id).toBe("2")
    expect(encoded.payload.installation.id).toBe("3")
  })

  it("does not decode unsupported pull request actions", () => {
    const input = {
      id: "delivery-1",
      name: "pull_request",
      payload: {
        action: "review_requested",
        number: 6503,
        pull_request: {
          id: 1,
          node_id: "PR_1",
          title: "Add PostgreSQL name length limit support",
          body: null,
          draft: false,
          user: { login: "octocat" },
          head: { sha: "abc123" },
          base: { ref: "main" },
        },
        repository: {
          id: 2,
          full_name: "Effect-TS/effect",
        },
        installation: { id: 3 },
      },
    }

    expect(Option.isNone(decode(input))).toBe(true)
    expect(
      Option.isSome(
        decode({
          ...input,
          payload: { ...input.payload, action: "opened" },
        }),
      ),
    ).toBe(true)

    const result = decodeResult(input)
    if (Result.isSuccess(result)) {
      throw new Error("Expected the unsupported action to fail decoding")
    }

    const issue = result.failure.issue.toString()
    expect(issue).toContain(
      "Unsupported or malformed pull request webhook action",
    )
    expect(issue).not.toContain("review_requested")
    expect(issue).not.toContain(input.payload.pull_request.title)
  })
})
