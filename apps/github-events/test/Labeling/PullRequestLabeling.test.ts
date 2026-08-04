import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import { describe, expect, it } from "@effect/vitest"
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { GitHubPullRequest } from "../../src/GitHub/GitHubPullRequest.ts"
import { PullRequestLabeling } from "../../src/Labeling/PullRequestLabeling.ts"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { LabelingDecisionsRepo } from "../../src/Labeling/repositories/LabelingDecisionsRepo.ts"

const now = DateTime.fromDateUnsafe(new Date("2026-07-21T12:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)(
    "repository-1",
  ),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("2"),
  owner: "Effect-TS",
  repo: "effect",
  isPrivate: false,
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("3"),
  enabled: true,
  rulesRevision: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const rule = new LabelingRule.LabelingRule({
  id: Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)("rule-1"),
  repositoryId: repository.id,
  label: "bug",
  instructions: "Apply to bug fixes.",
  mode: "add-only",
  exclusiveGroup: null,
  enabled: true,
  validationStatus: "valid",
  validatedAt: now,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const event = Schema.decodeUnknownSync(GitHubWebhookEvent.GitHubWebhookEvent)({
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

const unavailable = Effect.die("Unexpected test service call")
const openAiClientLayer = OpenAiClient.layer({}).pipe(
  Layer.provide(FetchHttpClient.layer),
)

const testLayer = (activeRules: boolean) => {
  const dependencies = Layer.mergeAll(
    Layer.succeed(GitHubPullRequest, {
      resolveWebhook: () =>
        Effect.succeed({
          deliveryId: event.id,
          repository,
          number: event.payload.number,
          title: event.payload.pull_request.title,
          body: event.payload.pull_request.body,
          baseRef: event.payload.pull_request.base.ref,
          headSha: event.payload.pull_request.head.sha,
        }),
      getEvidence: () => unavailable,
      getLabels: () => unavailable,
      applyLabels: () => unavailable,
    }),
    Layer.succeed(LabelingRules, {
      listAudit: () => Effect.die("Unexpected audit request"),
      listActivity: () => Effect.die("Unexpected activity request"),
      list: () => unavailable,
      get: () => unavailable,
      create: () => unavailable,
      update: () => unavailable,
      revalidate: () => unavailable,
      disable: () => unavailable,
      remove: () => unavailable,
      getActiveSnapshot: () =>
        Effect.succeed({
          repositoryId: repository.id,
          repository: repository.slug,
          revision: repository.rulesRevision,
          rules: activeRules ? [rule] : [],
        }),
      assertRevision: () => unavailable,
      listAvailableLabels: () => unavailable,
      validateCandidateLabel: () => unavailable,
      markMissing: () => unavailable,
      revalidateStaleBatch: () => unavailable,
    }),
    Layer.succeed(LabelingDecisionsRepo, { record: () => unavailable }),
    openAiClientLayer,
  )
  const config = ConfigProvider.layer(
    ConfigProvider.fromUnknown({
      AI_MODEL: "test-model",
    }),
  )
  return PullRequestLabeling.layerNoDeps.pipe(
    Layer.provide(dependencies),
    Layer.provide(config),
  )
}

describe("PullRequestLabeling", () => {
  it.effect("skips processing when no rules are enabled", () =>
    Effect.gen(function* () {
      const labeling = yield* PullRequestLabeling
      yield* labeling.process(event)
      expect(true).toBe(true)
    }).pipe(Effect.provide(testLayer(false))),
  )
})
