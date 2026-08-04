import { Schema } from "effect"
import * as GitHubAppAuth from "@slopcop/domain/GitHub/GitHubAppAuth"
import * as GitHubEvent from "@slopcop/domain/GitHub/GitHubEvent"
import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as LabelClassification from "@slopcop/domain/Labeling/LabelClassification"
import * as Option from "effect/Option"
import { describe, expect, it } from "vite-plus/test"

const decodes = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  input: unknown,
) => Option.isSome(Schema.decodeUnknownOption(schema)(input))

describe("domain schemas", () => {
  it("encodes GitHub App JWT claims as JSON", () => {
    expect(
      Schema.encodeSync(GitHubAppAuth.GitHubAppJwtHeaderJson)({
        alg: "RS256",
        typ: "JWT",
      }),
    ).toBe('{"alg":"RS256","typ":"JWT"}')
    expect(
      Schema.encodeSync(GitHubAppAuth.GitHubAppJwtPayloadJson)({
        iat: 100,
        exp: 700,
        iss: "12345",
      }),
    ).toBe('{"iat":100,"exp":700,"iss":"12345"}')
  })

  it("decodes an existing github_events row", () => {
    expect(
      decodes(GitHubEvent.GitHubEvent, {
        id: "delivery-1",
        name: "pull_request",
        status: "processing",
        attempts: 1,
        lastError: null,
        createdAt: Date.parse("2026-07-21T12:00:00Z"),
        updatedAt: Date.parse("2026-07-21T12:01:00Z"),
        deletedAt: null,
      }),
    ).toBe(true)
  })

  it("bounds labels, patches, and confidence", () => {
    expect(decodes(GitHubLabel.GitHubLabelName, "bug")).toBe(true)
    expect(decodes(GitHubLabel.GitHubLabelName, "x".repeat(51))).toBe(false)
    expect(
      decodes(LabelClassification.ChangedFileEvidence, {
        filename: "src/index.ts",
        status: "modified",
        patch: "x".repeat(LabelClassification.MAX_PATCH_CHARS_PER_FILE + 1),
        patchTruncated: false,
      }),
    ).toBe(false)
    expect(
      decodes(LabelClassification.RuleDecision, {
        ruleId: "01981f17-26e0-7c4d-aad7-0fd3c554bb6f",
        applies: true,
        confidence: 1.01,
        rationale: "Matches the configured rule.",
      }),
    ).toBe(false)
  })

  it("encodes repository summaries without internal identities", () => {
    expect(
      Schema.encodeSync(RepositoryManagement.RepositorySummary)({
        owner: "Effect-TS",
        repo: "effect",
        isPrivate: false,
        enabled: true,
      }),
    ).toEqual({
      owner: "Effect-TS",
      repo: "effect",
      isPrivate: false,
      enabled: true,
    })
  })

  it("accepts edited pull request events with an installation id", () => {
    expect(
      decodes(GitHubWebhookEvent.GitHubWebhookEvent, {
        id: "delivery-1",
        name: "pull_request",
        payload: {
          action: "edited",
          number: 1,
          pull_request: {
            id: 1,
            node_id: "PR_1",
            title: "Update behavior",
            body: null,
            draft: false,
            user: { login: "octocat" },
            head: { sha: "abc123" },
            base: { ref: "main" },
          },
          repository: { id: 2, full_name: "Effect-TS/effect" },
          installation: { id: 3 },
        },
      }),
    ).toBe(true)
  })
})
