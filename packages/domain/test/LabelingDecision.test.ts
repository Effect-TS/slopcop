import * as GitHubWebhookDelivery from "@slopcop/domain/GitHub/GitHubWebhookDelivery"
import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingDecision from "@slopcop/domain/Labeling/LabelingDecision"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vite-plus/test"

describe("LabelingDecision", () => {
  it("encodes D1 JSON and boolean fields", () => {
    const decision = LabelingDecision.LabelingDecision.insert.make({
      deliveryId: Schema.decodeUnknownSync(
        GitHubWebhookDelivery.GitHubWebhookDeliveryId,
      )("delivery-1"),
      repositoryId: Schema.decodeUnknownSync(
        GitHubRepository.GitHubRepositoryId,
      )("repository-1"),
      subjectType: "pull_request",
      subjectNumber: 42,
      headSha: "abc123",
      rulesRevision: 1,
      selectedRuleIds: [
        Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)("rule-1"),
      ],
      selectedLabels: [
        Schema.decodeUnknownSync(GitHubLabel.GitHubLabelName)("bug"),
      ],
      model: "test-model",
      promptVersion: "1",
      labelsAdded: [
        Schema.decodeUnknownSync(GitHubLabel.GitHubLabelName)("bug"),
      ],
      labelsRemoved: [],
    })

    const encoded = Schema.encodeSync(LabelingDecision.LabelingDecision.insert)(
      decision,
    )
    expect(encoded.selectedRuleIds).toBe('["rule-1"]')
    expect(encoded.selectedLabels).toBe('["bug"]')
    expect(encoded.labelsAdded).toBe('["bug"]')
    expect(encoded.labelsRemoved).toBe("[]")
  })
})
