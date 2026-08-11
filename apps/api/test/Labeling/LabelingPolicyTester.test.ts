import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import { GitHubClient, GitHubClientError } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { Policies } from "@slopcop/labeling/Policies"
import { PolicyCompileError } from "@slopcop/labeling/PolicyCompiler"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
import { PoliciesRepo } from "@slopcop/labeling/repositories/PoliciesRepo"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { LabelingPolicyTester } from "../../src/Labeling/LabelingPolicyTester.ts"
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
const draftProgram: Program.PolicyProgram = {
  target: "pull_request",
  appliesWhen: null,
  matchesWhen: {
    _tag: "FactPredicate",
    fact: "pull_request.draft",
    operator: "Equals",
    value: false,
  },
}
const policy = new Policy.LabelingPolicy({
  id: policyId,
  repositoryId: repository.id,
  name: "Draft policy",
  target: "pull_request",
  publishedVersionId: null,
  version: 3,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const draft = new Policy.LabelingPolicyDraft({
  policyId,
  repositoryId: repository.id,
  program: draftProgram,
  metadata: {},
  version: 3,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const unavailable = Effect.die("Unexpected write or service call")
const unavailableStream = Stream.die("Unexpected stream call")
const layer = (
  notFound: boolean,
  validationError: PolicyCompileError | null = null,
) =>
  LabelingPolicyTester.layerNoDeps.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Policies, {
          list: () => unavailable,
          get: () => Effect.succeed({ policy, draft }),
          create: () => unavailable,
          updateDraft: () => unavailable,
          validate: () =>
            validationError === null
              ? Effect.succeed({
                  program: draftProgram,
                  facts: ["pull_request.draft"],
                  triggers: ["pull_request:unlabeled"],
                  references: [],
                  nodeCount: 1,
                  expandedNodeCount: 1,
                  requiresChangedFileContent: false,
                })
              : Effect.fail(validationError),
          publish: () => unavailable,
          listVersions: () => unavailable,
        }),
        Layer.succeed(PoliciesRepo, {
          list: () => unavailable,
          find: () => unavailable,
          findDraft: () => unavailable,
          findVersion: () => unavailable,
          findResolvedVersion: () => Effect.succeed(Option.none()),
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
        Layer.succeed(GitHubRepositoriesRepo, {
          list: () => unavailable,
          findBySlug: () => Effect.succeed(Option.some(repository)),
          findByGitHubId: () => unavailable,
          findById: () => unavailable,
          getRulesRevision: () => unavailable,
          incrementRulesRevision: () => unavailable,
          updateEnabled: () => unavailable,
          replaceInstallationRepositories: () => unavailable,
        }),
        Layer.succeed(GitHubClient, {
          getRepositoryLabel: () => unavailable,
          listRepositoryLabels: () => unavailableStream,
          listPullRequestFiles: () => unavailableStream,
          listOpenPullRequests: () => unavailable,
          getPullRequest: () =>
            notFound
              ? Effect.fail(
                  new GitHubClientError({
                    operation: "GitHubClient.getPullRequest",
                    status: 404,
                    retryable: false,
                    message: "Not found",
                  }),
                )
              : Effect.succeed({
                  number: 42,
                  title: "Fix",
                  body: null,
                  draft: false,
                  head: { sha: "sha" },
                  base: { ref: "main" },
                }),
          listItemLabels: () => Stream.empty,
          addItemLabels: () => unavailable,
          removeItemLabel: () => unavailable,
          listPullRequestsForCommit: () => unavailable,
          listPullRequestReviews: () => unavailable,
          getFileContent: () => unavailable,
          listRequiredChecks: () => unavailable,
          listCheckRuns: () => unavailable,
          listCommitStatuses: () => unavailable,
        }),
        Layer.succeed(PolicyFacts, {
          load: () =>
            Effect.succeed({
              draft: false,
              title: "Fix",
              body: null,
              baseRef: "main",
              headSha: "sha",
              currentLabels: [],
              changedFiles: null,
              changedFilesComplete: null,
              requiredChecks: null,
              latestReviews: null,
            }),
        }),
      ),
    ),
  )
describe("LabelingPolicyTester", () => {
  it.effect("evaluates the mutable draft without writing", () =>
    Effect.gen(function* () {
      const result = yield* (yield* LabelingPolicyTester).test(
        repository,
        policyId,
        42,
      )
      expect(result).toMatchObject({
        policyId: "policy",
        tested: { _tag: "Draft", version: 3 },
        decision: {
          outcome: "Match",
          trace: [
            {
              location: { root: "matchesWhen", path: [] },
              outcome: "Match",
            },
          ],
        },
      })
    }).pipe(Effect.provide(layer(false))),
  )
  it.effect("preserves typed pull request not-found information", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* LabelingPolicyTester).test(repository, policyId, 42),
      )
      expect(error).toMatchObject({
        _tag: "LabelingPolicyTestError",
        notFound: true,
        retryable: false,
      })
    }).pipe(Effect.provide(layer(true))),
  )
  it.effect("preserves invalid included-policy errors", () => {
    const compileError = new PolicyCompileError({
      reason: "MissingReference",
      message: "Published policy version 'missing' does not exist.",
      location: { root: "matchesWhen", path: [] },
    })
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* LabelingPolicyTester).test(repository, policyId, 42),
      )

      expect(error).toBe(compileError)
    }).pipe(Effect.provide(layer(false, compileError)))
  })
})
