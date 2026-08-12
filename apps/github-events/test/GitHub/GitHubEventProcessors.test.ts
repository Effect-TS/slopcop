import { describe, expect, it } from "@effect/vitest"
import { isRetryableProcessorError } from "../../src/GitHub/GitHubEventProcessors.ts"

describe("GitHub event processor retry classification", () => {
  it("does not retry an explicitly non-retryable nested failure", () => {
    expect(
      isRetryableProcessorError({
        _tag: "GitHubEventProcessorError",
        cause: {
          _tag: "LabelingCoordinatorError",
          cause: { _tag: "GitHubClientError", retryable: false },
        },
      }),
    ).toBe(false)
  })

  it("retries transient and unclassified failures", () => {
    expect(
      isRetryableProcessorError({
        _tag: "GitHubEventProcessorError",
        cause: { _tag: "GitHubClientError", retryable: true },
      }),
    ).toBe(true)
    expect(isRetryableProcessorError(new Error("unknown"))).toBe(true)
  })
})
