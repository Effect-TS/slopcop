import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import * as Audit from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { LabelingRuleAuditLogRepo } from "@slopcop/labeling/repositories/LabelingRuleAuditLogRepo"
import { LabelingRulesRepo } from "@slopcop/labeling/repositories/LabelingRulesRepo"
import { LabelingRuleStatsRepo } from "@slopcop/labeling/repositories/LabelingRuleStatsRepo"
import { PoliciesRepo } from "@slopcop/labeling/repositories/PoliciesRepo"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
const now = DateTime.fromDateUnsafe(new Date("2026-08-10T00:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)("repo"),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("1"),
  owner: "o",
  repo: "r",
  isPrivate: false,
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("2"),
  enabled: true,
  rulesRevision: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const policyId = Schema.decodeUnknownSync(Policy.LabelingPolicyId)("policy")
const current = new Rule.LabelingRule({
  id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("rule"),
  repositoryId: repository.id,
  policyId,
  label: "Bug",
  onMatch: "ensure-present",
  onNoMatch: "preserve",
  conflictGroup: null,
  priority: 0,
  enabled: true,
  validationStatus: "valid",
  validatedAt: now,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const unavailable = Effect.die("Unexpected call")
const unavailableStream = Stream.die("Unexpected stream call")
describe("LabelingRules validation", () => {
  it.effect("disables and audits a stored rule whose label disappeared", () => {
    const auditOperations: Array<string> = []
    const layer = LabelingRules.layerNoDeps.pipe(
      Layer.provide([
        Layer.succeed(GitHubRepositoriesRepo, {
          list: () => unavailable,
          findBySlug: () => Effect.succeed(Option.some(repository)),
          findByGitHubId: () => unavailable,
          findById: () => Effect.succeed(Option.some(repository)),
          getRulesRevision: () => Effect.succeed(1),
          incrementRulesRevision: () => Effect.succeed(2),
          updateEnabled: () => unavailable,
          replaceInstallationRepositories: () => unavailable,
        }),
        Layer.succeed(LabelingRulesRepo, {
          listByRepository: () => Effect.succeed([current]),
          findById: () => Effect.succeed(Option.some(current)),
          insert: () => unavailable,
          update: (_id, _version, input) =>
            Effect.succeed(
              new Rule.LabelingRule({
                id: current.id,
                repositoryId: current.repositoryId,
                policyId: input.policyId,
                label: input.label,
                onMatch: input.onMatch,
                onNoMatch: input.onNoMatch,
                conflictGroup: input.conflictGroup,
                priority: input.priority,
                enabled: input.enabled,
                validationStatus: input.validationStatus,
                validatedAt: input.validatedAt,
                version: 2,
                createdAt: now,
                updatedAt: now,
                deletedAt: Option.none(),
              }),
            ),
          remove: () => unavailable,
          listStaleEnabled: () => unavailable,
        }),
        Layer.succeed(LabelingRuleAuditLogRepo, {
          append: (input) =>
            Effect.sync(() => {
              auditOperations.push(input.operation)
              return new Audit.LabelingRuleAuditEntry({
                ...input,
                id: Schema.decodeUnknownSync(Audit.LabelingRuleAuditEntryId)(
                  "audit",
                ),
                createdAt: now,
              })
            }),
          listByRepository: () => unavailable,
          listActivity: () => unavailable,
        }),
        Layer.succeed(LabelingRuleStatsRepo, {
          listRecentFires: () => unavailable,
        }),
        Layer.succeed(PoliciesRepo, {
          list: () => unavailable,
          find: () => unavailable,
          findDraft: () => unavailable,
          findVersion: () => unavailable,
          findResolvedVersion: () => unavailable,
          findVersionByHash: () => unavailable,
          listVersions: () => unavailable,
          insertPolicy: () => unavailable,
          insertDraft: () => unavailable,
          updateDraft: () => unavailable,
          updatePolicy: () => unavailable,
          insertVersion: () => unavailable,
          insertDependencies: () => unavailable,
          insertTriggers: () => unavailable,
          publish: () => unavailable,
          activateVersion: () => unavailable,
          discardStagedVersions: () => unavailable,
        }),
        Layer.succeed(GitHubClient, {
          getRepositoryLabel: () => Effect.succeed(Option.none()),
          listRepositoryLabels: () => Stream.empty,
          listPullRequestFiles: () => unavailableStream,
          listOpenPullRequests: () => unavailable,
          getPullRequest: () => unavailable,
          listItemLabels: () => unavailableStream,
          addItemLabels: () => unavailable,
          removeItemLabel: () => unavailable,
          listPullRequestsForCommit: () => unavailable,
          listPullRequestReviews: () => unavailable,
          getFileContent: () => unavailable,
          listRequiredChecks: () => unavailable,
          listCheckRuns: () => unavailable,
          listCommitStatuses: () => unavailable,
        }),
      ]),
    )
    return Effect.gen(function* () {
      const updated = yield* (yield* LabelingRules).revalidate(
        repository,
        current.id,
        { actor: "test" },
      )
      expect(updated).toMatchObject({
        enabled: false,
        validationStatus: "missing",
        version: 2,
      })
      expect(auditOperations).toEqual(["validate"])
    }).pipe(Effect.provide(layer))
  })
})
