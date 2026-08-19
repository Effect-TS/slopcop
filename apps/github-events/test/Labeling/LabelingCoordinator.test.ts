import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubDatasetSync from "@slopcop/domain/GitHub/GitHubDatasetSync"
import * as DomainPullRequest from "@slopcop/domain/GitHub/GitHubPullRequest"
import * as Webhook from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Evaluation from "@slopcop/domain/Labeling/PolicyEvaluation"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import { UnexpectedRowCount } from "@slopcop/infra/Sql/RepositoryError"
import {
  GitHubClient,
  GitHubClientError,
  type ConditionalSnapshot,
  type OpenPullRequestSnapshot,
  type PullRequestSummary,
} from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { GitHubPullRequestsRepo } from "@slopcop/github/repositories/GitHubPullRequestsRepo"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { OptionalPolicyAiLayer } from "@slopcop/labeling/Ai"
import { PolicyAi, PolicyAiError } from "@slopcop/labeling/PolicyAi"
import {
  evaluatePolicyProgram,
  type CheckObservation,
} from "@slopcop/labeling/PolicyEngine"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
import { PoliciesRepo } from "@slopcop/labeling/repositories/PoliciesRepo"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  GitHubPullRequest,
  GitHubPullRequestLabelsError,
} from "../../src/GitHub/GitHubPullRequest.ts"
import {
  LabelingCoordinator,
  triggerMatches,
} from "../../src/Labeling/LabelingCoordinator.ts"
import {
  PolicyEvaluationsRepo,
  PolicyEvaluationsRepoError,
} from "../../src/Labeling/repositories/PolicyEvaluationsRepo.ts"

const now = DateTime.fromDateUnsafe(new Date("2026-08-10T00:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)("repo-1"),
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
  rulesRevision: 7,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const policyId = Schema.decodeUnknownSync(Policy.LabelingPolicyId)("policy")
const versionId = Schema.decodeUnknownSync(Program.PolicyVersionId)("version")
const ruleId = Schema.decodeUnknownSync(Rule.LabelingRuleId)("rule")
const deterministicProgram: Program.PolicyProgram = {
  target: "pull_request",
  appliesWhen: null,
  matchesWhen: {
    _tag: "FactPredicate",
    fact: "pull_request.draft",
    operator: "Equals",
    value: false,
  },
}
const requiredChecksProgram: Program.PolicyProgram = {
  target: "pull_request",
  appliesWhen: null,
  matchesWhen: {
    _tag: "CollectionPredicate",
    fact: "pull_request.required_checks",
    quantifier: "All",
    item: {
      _tag: "Predicate",
      field: "state",
      operator: "Equals",
      value: "success",
    },
  },
}
const policy = new Policy.LabelingPolicy({
  id: policyId,
  repositoryId: repository.id,
  name: "Policy",
  target: "pull_request",
  publishedVersionId: versionId,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const version = (
  program: Program.PolicyProgram,
  triggerManifest: ReadonlyArray<string> = ["pull_request:unlabeled"],
) =>
  new Policy.LabelingPolicyVersion({
    id: versionId,
    policyId,
    repositoryId: repository.id,
    revision: 1,
    program,
    contentHash: "hash",
    registryManifest: ["pull_request.draft"],
    triggerManifest,
    publicationStatus: "published",
    createdAt: now,
  })
const rule = new Rule.PolicyLabelingRule({
  _tag: "PolicyLabelingRule",
  id: ruleId,
  repositoryId: repository.id,
  policyId,
  label: "managed",
  onMatch: "ensure-present",
  onNoMatch: "ensure-absent",
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
const aiRule = (
  gatePolicyId: Policy.LabelingPolicy["id"] | null = null,
  options?: {
    readonly id?: Rule.LabelingRule["id"]
    readonly label?: string
  },
) =>
  new Rule.AiLabelingRule({
    _tag: "AiLabelingRule",
    id: options?.id ?? ruleId,
    repositoryId: repository.id,
    label: options?.label ?? "managed",
    onMatch: "ensure-present",
    onNoMatch: "ensure-absent",
    conflictGroup: null,
    priority: 0,
    enabled: true,
    validationStatus: "valid",
    validatedAt: now,
    version: 1,
    prompt: "Classify",
    evidence: ["pull_request.title"],
    minimumConfidence: 0.8,
    evaluator: "boolean-policy-v1",
    gatePolicyId,
    createdAt: now,
    updatedAt: now,
    deletedAt: Option.none(),
  })
const event = Schema.decodeUnknownSync(Webhook.GitHubWebhookEvent)({
  id: "delivery",
  name: "pull_request",
  payload: {
    action: "unlabeled",
    number: 42,
    pull_request: {
      id: 1,
      node_id: "PR",
      title: "Fix",
      body: null,
      draft: false,
      user: { login: "octocat" },
      head: { sha: "sha" },
      base: { ref: "main" },
    },
    repository: { id: 2, full_name: "Effect-TS/effect" },
    installation: { id: 3 },
  },
})
const checkRunWithPullRequestsEvent = Schema.decodeUnknownSync(
  Webhook.GitHubWebhookEvent,
)({
  id: "fork-check-run",
  name: "check_run",
  payload: {
    action: "completed",
    check_run: {
      head_sha: "sha",
      pull_requests: [{ number: 42 }],
    },
    repository: { id: 2, full_name: "Effect-TS/effect" },
    installation: { id: 3 },
  },
})
const forkCheckRunEvent = Schema.decodeUnknownSync(Webhook.GitHubWebhookEvent)({
  id: "fork-check-run",
  name: "check_run",
  payload: {
    action: "completed",
    check_run: { head_sha: "fork-sha", pull_requests: [] },
    repository: { id: 2, full_name: "Effect-TS/effect" },
    installation: { id: 3 },
  },
})
const checkRunWithMultiplePullRequestsEvent = Schema.decodeUnknownSync(
  Webhook.GitHubWebhookEvent,
)({
  id: "multiple-check-run",
  name: "check_run",
  payload: {
    action: "completed",
    check_run: {
      head_sha: "sha",
      pull_requests: [{ number: 41 }, { number: 42 }],
    },
    repository: { id: 2, full_name: "Effect-TS/effect" },
    installation: { id: 3 },
  },
})
const checkRunWithoutPullRequestsEvent = Schema.decodeUnknownSync(
  Webhook.GitHubWebhookEvent,
)({
  id: "unmatched-check-run",
  name: "check_run",
  payload: {
    action: "completed",
    check_run: { head_sha: "unknown-sha", pull_requests: [] },
    repository: { id: 2, full_name: "Effect-TS/effect" },
    installation: { id: 3 },
  },
})
const summary = {
  number: 42,
  title: "Fix",
  body: null,
  draft: false,
  head: { sha: "sha" },
  base: { ref: "main" },
}
const unavailable = Effect.die("Unexpected call")
const unavailableStream = Stream.die("Unexpected stream call")
const openPullRequest = (
  number: number,
  headSha: string,
): OpenPullRequestSnapshot => ({
  number,
  state: "open",
  title: "Fix",
  body: null,
  draft: false,
  author: "octocat",
  baseRef: "main",
  headSha,
  createdAt: now,
  updatedAt: now,
})
interface State {
  activeSnapshotReads: number
  configured: boolean
  revision: number
  currentHeadSha: string
  currentTitle: string
  aiFails: boolean
  aiCalls: number
  commitPullRequests: ReadonlyArray<PullRequestSummary>
  commitLookupStatus: number | null
  factLoads: number
  factLoadingFailureAt: number | null
  labels: Set<string>
  openPullRequests: ReadonlyArray<OpenPullRequestSnapshot>
  openPullRequestPages: Map<number, ReadonlyArray<OpenPullRequestSnapshot>>
  cachedOpenPullRequests: ReadonlyArray<OpenPullRequestSnapshot>
  openPullRequestSnapshotCalls: Array<{
    readonly etag: string | null
    readonly page: number
  }>
  openPullRequestSnapshotNotModified: boolean
  openPullRequestSnapshotStatus: number | null
  pullRequestSyncEtag: string | null
  pullRequestStatuses: Map<number, number>
  requestedPullRequests: Array<number>
  requiredChecks: ReadonlyArray<CheckObservation> | null
  applies: number
  markedMissing: number
  labelMutationFails: boolean
  labelMutationRetryable: boolean
  repositoryLabelExists: boolean
  failActionPersistence: boolean
  operations: Array<string>
  completions: Array<boolean>
  evaluations: Array<typeof Evaluation.PolicyEvaluation.insert.Type>
  actions: Array<typeof Evaluation.PolicyActionExecution.insert.Type>
}
const state = (): State => ({
  activeSnapshotReads: 0,
  configured: true,
  revision: 7,
  currentHeadSha: "sha",
  currentTitle: "Fix",
  aiFails: false,
  aiCalls: 0,
  commitPullRequests: [],
  commitLookupStatus: null,
  factLoads: 0,
  factLoadingFailureAt: null,
  labels: new Set(["unmanaged"]),
  openPullRequests: [],
  openPullRequestPages: new Map(),
  cachedOpenPullRequests: [],
  openPullRequestSnapshotCalls: [],
  openPullRequestSnapshotNotModified: false,
  openPullRequestSnapshotStatus: null,
  pullRequestSyncEtag: null,
  pullRequestStatuses: new Map(),
  requestedPullRequests: [],
  requiredChecks: null,
  applies: 0,
  markedMissing: 0,
  labelMutationFails: false,
  labelMutationRetryable: false,
  repositoryLabelExists: true,
  failActionPersistence: false,
  operations: [],
  completions: [],
  evaluations: [],
  actions: [],
})
const layer = (
  value: State,
  program: Program.PolicyProgram = deterministicProgram,
  scenario?: {
    readonly policies: ReadonlyArray<Policy.LabelingPolicy>
    readonly versions: ReadonlyArray<Policy.LabelingPolicyVersion>
    readonly rules: ReadonlyArray<Rule.LabelingRule>
  },
) =>
  LabelingCoordinator.layerNoDeps.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(GitHubClient, {
          getRepositoryLabel: () =>
            Effect.succeed(
              value.repositoryLabelExists
                ? Option.some({
                    name: "managed",
                    description: null,
                    color: "ffffff",
                  })
                : Option.none(),
            ),
          listRepositoryLabels: () => unavailableStream,
          listPullRequestFiles: () => unavailableStream,
          listOpenPullRequests: () => unavailable,
          listOpenPullRequestSnapshot: (
            _repository,
            etag,
            page = 1,
          ): Effect.Effect<
            ConditionalSnapshot<OpenPullRequestSnapshot>,
            GitHubClientError
          > =>
            Effect.gen(function* () {
              value.openPullRequestSnapshotCalls.push({ etag, page })
              if (value.openPullRequestSnapshotStatus !== null)
                return yield* Effect.fail(
                  new GitHubClientError({
                    operation: "GitHubClient.listOpenPullRequests",
                    status: value.openPullRequestSnapshotStatus,
                    retryable: value.openPullRequestSnapshotStatus >= 500,
                    message: "Pull request snapshot unavailable.",
                  }),
                )
              if (
                page === 1 &&
                etag !== null &&
                value.openPullRequestSnapshotNotModified
              )
                return { _tag: "NotModified" as const }
              const pullRequests =
                value.openPullRequestPages.get(page) ??
                (page === 1 ? value.openPullRequests : [])
              return {
                _tag: "Modified" as const,
                value: pullRequests,
                etag: null,
                lastModified: null,
                hasNextPage: pullRequests.length === 100,
              }
            }),
          getPullRequest: (_repository, number) =>
            Effect.suspend(() => {
              value.requestedPullRequests.push(number)
              const status = value.pullRequestStatuses.get(number)
              return status === undefined
                ? Effect.succeed({
                    ...summary,
                    number,
                    title: value.currentTitle,
                    head: { sha: value.currentHeadSha },
                  })
                : Effect.fail(
                    new GitHubClientError({
                      operation: "GitHubClient.getPullRequest",
                      status,
                      retryable: status >= 500,
                      message: "Pull request unavailable.",
                    }),
                  )
            }),
          listItemLabels: () => unavailableStream,
          addItemLabels: () => unavailable,
          removeItemLabel: () => unavailable,
          listPullRequestsForCommit: () =>
            value.commitLookupStatus === null
              ? Effect.succeed(value.commitPullRequests)
              : Effect.fail(
                  new GitHubClientError({
                    operation: "GitHubClient.listPullRequestsForCommit",
                    status: value.commitLookupStatus,
                    retryable: false,
                    message: "Commit not found.",
                  }),
                ),
          listPullRequestReviews: () => unavailable,
          getFileContent: () => unavailable,
          listRequiredChecks: () => unavailable,
          listCheckRuns: () => unavailable,
          listCommitStatuses: () => unavailable,
        }),
        Layer.succeed(GitHubPullRequest, {
          resolveRepository: () =>
            value.configured
              ? Effect.succeed(repository)
              : Effect.fail(
                  new RepositoryNotConfigured({ repository: repository.slug }),
                ),
          resolveWebhook: () => unavailable,
          getEvidence: () => unavailable,
          getLabels: () => Effect.succeed(new Set(value.labels)),
          applyLabels: (_pullRequest, changes) =>
            value.labelMutationFails
              ? Effect.succeed({
                  added: [],
                  removed: [],
                  failures: [
                    new GitHubPullRequestLabelsError({
                      operation: "add",
                      repository: repository.slug,
                      number: 42,
                      label: "managed",
                      status: value.labelMutationRetryable ? 500 : 422,
                      retryable: value.labelMutationRetryable,
                      message: "GitHub rejected the label mutation.",
                    }),
                  ],
                })
              : Effect.sync(() => {
                  value.operations.push("github")
                  value.applies++
                  const added = changes.add.filter(
                    (label) => !value.labels.has(label),
                  )
                  const removed = changes.remove.filter((label) =>
                    value.labels.has(label),
                  )
                  added.forEach((label) => value.labels.add(label))
                  removed.forEach((label) => value.labels.delete(label))
                  return { added, removed, failures: [] }
                }),
        }),
        Layer.succeed(GitHubRepositoriesRepo, {
          list: () => unavailable,
          findBySlug: () => unavailable,
          findByGitHubId: () => unavailable,
          findById: () => unavailable,
          getRulesRevision: () => Effect.succeed(value.revision),
          incrementRulesRevision: () => unavailable,
          updateEnabled: () => unavailable,
          replaceInstallationRepositories: () => unavailable,
        }),
        Layer.succeed(GitHubPullRequestsRepo, {
          listOpen: () =>
            Effect.succeed(
              value.cachedOpenPullRequests.map(
                (pullRequest) =>
                  new DomainPullRequest.GitHubPullRequestRecord({
                    repositoryId: repository.id,
                    number: pullRequest.number,
                    state: pullRequest.state,
                    title: pullRequest.title,
                    body: pullRequest.body,
                    draft: pullRequest.draft,
                    author: pullRequest.author,
                    baseRef: pullRequest.baseRef,
                    headSha: pullRequest.headSha,
                    githubCreatedAt: pullRequest.createdAt,
                    githubUpdatedAt: pullRequest.updatedAt,
                    generation: 1,
                  }),
              ),
            ),
          findSync: () =>
            Effect.succeed(
              value.pullRequestSyncEtag === null
                ? Option.none()
                : Option.some(
                    new GitHubDatasetSync.GitHubPullRequestSync({
                      repositoryId: repository.id,
                      status: "ready",
                      etag: value.pullRequestSyncEtag,
                      lastModified: null,
                      lastAttemptAt: now,
                      lastSuccessAt: now,
                      nextRefreshAt: now,
                      consecutiveFailures: 0,
                      lastError: null,
                    }),
                  ),
            ),
          markRefreshing: () => unavailable,
          publishOpen: () => unavailable,
          markNotModified: () => unavailable,
          markFailed: () => unavailable,
        }),
        Layer.succeed(PoliciesRepo, {
          list: () => Effect.succeed(scenario?.policies ?? [policy]),
          find: () => unavailable,
          findDraft: () => unavailable,
          findVersion: (id) =>
            Effect.succeed(
              Option.fromNullishOr(
                scenario?.versions.find((candidate) => candidate.id === id) ??
                  version(program),
              ),
            ),
          findCurrentVersion: () =>
            Effect.succeed(
              Option.some({
                id: versionId,
                policyId,
                repositoryId: repository.id,
                revision: 1,
                program,
                contentHash: "hash",
                registryManifest: ["pull_request.draft"],
                triggerManifest: ["pull_request:unlabeled"],
                publicationStatus: "published" as const,
                createdAt: now,
                target: "pull_request" as const,
              }),
            ),
          findVersionByHash: () => unavailable,
          listVersions: () => unavailable,
          insertPolicy: () => unavailable,
          insertDraft: () => unavailable,
          updateDraft: () => unavailable,
          updatePolicy: () => unavailable,
          usage: () => unavailable,
          remove: () => unavailable,
          insertVersion: () => unavailable,
          insertDependencies: () => unavailable,
          insertTriggers: () => unavailable,
          setCurrentVersion: () => unavailable,
          activateVersion: () => unavailable,
          discardStagedVersions: () => unavailable,
        }),
        Layer.succeed(LabelingRules, {
          list: () => unavailable,
          get: () => unavailable,
          listAudit: () => unavailable,
          listActivity: () => unavailable,
          create: () => unavailable,
          update: () => unavailable,
          revalidate: () => unavailable,
          disable: () => unavailable,
          remove: () => unavailable,
          getActiveSnapshot: () =>
            Effect.sync(() => {
              value.activeSnapshotReads++
              return {
                repositoryId: repository.id,
                repository: repository.slug,
                revision: 7,
                rules: scenario?.rules ?? [rule],
              }
            }),
          assertRevision: () => unavailable,
          listAvailableLabels: () => unavailable,
          validateCandidateLabel: () => unavailable,
          markMissing: () =>
            Effect.sync(() => {
              value.operations.push("missing")
              value.markedMissing++
            }),
          revalidateStaleBatch: () => unavailable,
        }),
        Layer.succeed(PolicyFacts, {
          load: () =>
            Effect.suspend(() => {
              value.factLoads++
              if (value.factLoadingFailureAt === value.factLoads)
                return Effect.fail(
                  new GitHubClientError({
                    operation: "GitHubClient.getFileContent",
                    retryable: true,
                    message: "Content unavailable.",
                  }),
                )
              return Effect.succeed({
                draft: false,
                title: "Fix",
                body: null,
                baseRef: "main",
                headSha: value.currentHeadSha,
                currentLabels: [...value.labels],
                changedFiles: null,
                changedFilesComplete: null,
                requiredChecks: value.requiredChecks,
                latestReviews: null,
              })
            }),
        }),
        Layer.succeed(PolicyAi, {
          evaluate: () =>
            Effect.suspend(() => {
              value.aiCalls++
              return value.aiFails
                ? Effect.fail(
                    new PolicyAiError({
                      message: "AI unavailable",
                      cause: null,
                    }),
                  )
                : Effect.succeed({
                    matches: true,
                    confidence: 1,
                    rationale: "match",
                  })
            }),
        }),
        Layer.succeed(PolicyEvaluationsRepo, {
          recordEvaluation: (input) =>
            Effect.sync(() => {
              value.evaluations.push(input)
              const id = Schema.decodeUnknownSync(
                Evaluation.PolicyEvaluationId,
              )(`evaluation-${value.evaluations.length}`)
              return input._tag === "PolicyRuleEvaluation"
                ? new Evaluation.PolicyRuleEvaluation({
                    ...input,
                    id,
                    createdAt: now,
                  })
                : new Evaluation.AiRuleEvaluation({
                    ...input,
                    id,
                    createdAt: now,
                  })
            }),
          recordAction: (input) =>
            Effect.suspend(() => {
              value.operations.push("plan")
              if (value.failActionPersistence)
                return Effect.fail(
                  new PolicyEvaluationsRepoError({
                    operation: "RecordAction",
                    cause: new UnexpectedRowCount({ expected: 1, actual: 0 }),
                  }),
                )
              value.actions.push(input)
              return Effect.succeed(
                new Evaluation.PolicyActionExecution({
                  ...input,
                  id: Schema.decodeUnknownSync(
                    Evaluation.PolicyActionExecutionId,
                  )(`action-${value.actions.length}`),
                  createdAt: now,
                }),
              )
            }),
          completeAction: (_id, applied) =>
            Effect.suspend(() => {
              value.operations.push("complete")
              value.completions.push(applied)
              const input = value.actions[value.completions.length - 1]
              if (input === undefined)
                return Effect.die("Missing planned action")
              return Effect.succeed(
                new Evaluation.PolicyActionExecution({
                  ...input,
                  id: Schema.decodeUnknownSync(
                    Evaluation.PolicyActionExecutionId,
                  )(`action-${value.completions.length}`),
                  status: "completed",
                  applied,
                  createdAt: now,
                }),
              )
            }),
        }),
      ),
    ),
  )
const run = (
  value: State,
  program?: Program.PolicyProgram,
  scenario?: Parameters<typeof layer>[2],
  inputEvent: Webhook.GitHubWebhookEvent = event,
) =>
  Effect.gen(function* () {
    yield* (yield* LabelingCoordinator).process(inputEvent)
  }).pipe(Effect.provide(layer(value, program, scenario)))
const requiredChecksState = () => {
  const value = state()
  value.requiredChecks = [{ producer: "ci", name: "test", state: "success" }]
  return value
}
const runRequiredChecks = (
  value: State,
  inputEvent: Webhook.GitHubWebhookEvent,
) =>
  run(
    value,
    requiredChecksProgram,
    {
      policies: [policy],
      versions: [version(requiredChecksProgram, ["check_run:completed"])],
      rules: [rule],
    },
    inputEvent,
  )

describe("LabelingCoordinator", () => {
  it.effect("runs deterministic evaluation without OPENAI_API_KEY", () =>
    Effect.gen(function* () {
      const result = yield* evaluatePolicyProgram({
        program: deterministicProgram,
        repositoryId: repository.id,
        facts: {
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
        },
        resolver: { resolve: () => Effect.succeed(null) },
      })
      expect(result.outcome).toBe("Match")
    }).pipe(
      Effect.provide(OptionalPolicyAiLayer),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({}),
      ),
    ),
  )
  it("matches exact and wildcard trigger manifests", () => {
    expect(
      triggerMatches(["pull_request:unlabeled"], "pull_request:unlabeled"),
    ).toBe(true)
    expect(triggerMatches(["check_run:*"], "check_run:rerequested")).toBe(true)
  })
  it.effect(
    "applies managed labels once and preserves unmanaged labels",
    () => {
      const value = state()
      return Effect.gen(function* () {
        yield* run(value)
        expect(value.applies).toBe(1)
        expect([...value.labels].sort()).toEqual(["managed", "unmanaged"])
        expect(value.evaluations).toMatchObject([
          {
            trace: [
              {
                location: { root: "matchesWhen", path: [] },
                outcome: "Match",
              },
            ],
          },
        ])
        expect(value.actions).toMatchObject([
          { action: "add", selected: true, status: "planned", applied: false },
        ])
        expect(value.completions).toEqual([true])
        expect(value.operations).toEqual(["plan", "github", "complete"])
      })
    },
  )
  it.effect("resolves a pull request listed in a check run payload", () => {
    const value = requiredChecksState()
    return Effect.gen(function* () {
      yield* runRequiredChecks(value, checkRunWithPullRequestsEvent)
      expect(value.applies).toBe(1)
      expect(value.activeSnapshotReads).toBe(1)
      expect(value.requestedPullRequests).toEqual([42, 42])
      expect(value.openPullRequestSnapshotCalls).toEqual([])
    })
  })
  it.effect(
    "skips the snapshot when commit lookup resolves the pull request",
    () => {
      const value = requiredChecksState()
      value.currentHeadSha = "unknown-sha"
      value.commitPullRequests = [{ ...summary, head: { sha: "unknown-sha" } }]
      return Effect.gen(function* () {
        yield* runRequiredChecks(value, checkRunWithoutPullRequestsEvent)
        expect(value.applies).toBe(1)
        expect(value.openPullRequestSnapshotCalls).toEqual([])
        expect(value.requestedPullRequests).toEqual([42])
      })
    },
  )
  it.effect("skips CI candidate resolution without a matching trigger", () => {
    const value = requiredChecksState()
    return Effect.gen(function* () {
      yield* run(value, deterministicProgram, undefined, forkCheckRunEvent)
      expect(value.openPullRequestSnapshotCalls).toEqual([])
      expect(value.requestedPullRequests).toEqual([])
    })
  })
  it.effect("skips CI candidate resolution without active rules", () => {
    const value = requiredChecksState()
    return Effect.gen(function* () {
      yield* run(
        value,
        requiredChecksProgram,
        {
          policies: [policy],
          versions: [version(requiredChecksProgram, ["check_run:completed"])],
          rules: [],
        },
        forkCheckRunEvent,
      )
      expect(value.openPullRequestSnapshotCalls).toEqual([])
      expect(value.requestedPullRequests).toEqual([])
    })
  })
  it.effect("uses compiled triggers when a referenced policy changes", () => {
    const referencedPolicyId = Schema.decodeUnknownSync(
      Policy.LabelingPolicyId,
    )("referenced-policy")
    const referencedVersionId = Schema.decodeUnknownSync(
      Program.PolicyVersionId,
    )("referenced-version")
    const referencedPolicy = new Policy.LabelingPolicy({
      id: referencedPolicyId,
      repositoryId: policy.repositoryId,
      name: "Referenced policy",
      target: policy.target,
      publishedVersionId: referencedVersionId,
      version: policy.version,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      deletedAt: policy.deletedAt,
    })
    const referenceProgram: Program.PolicyProgram = {
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        _tag: "PolicyReference",
        policyId: referencedPolicyId,
      },
    }
    const referencedVersion = new Policy.LabelingPolicyVersion({
      id: referencedVersionId,
      policyId: referencedPolicyId,
      repositoryId: repository.id,
      revision: 1,
      program: requiredChecksProgram,
      contentHash: "referenced-hash",
      registryManifest: ["pull_request.required_checks"],
      triggerManifest: ["check_run:completed"],
      publicationStatus: "published",
      createdAt: now,
    })
    const value = requiredChecksState()
    value.currentHeadSha = "fork-sha"
    value.openPullRequests = [openPullRequest(42, "fork-sha")]
    return Effect.gen(function* () {
      yield* run(
        value,
        referenceProgram,
        {
          policies: [policy, referencedPolicy],
          versions: [
            version(referenceProgram, ["pull_request:unlabeled"]),
            referencedVersion,
          ],
          rules: [rule],
        },
        forkCheckRunEvent,
      )
      expect(value.applies).toBe(1)
      expect(value.openPullRequestSnapshotCalls).toEqual([
        { etag: null, page: 1 },
      ])
    })
  })
  it.effect("resolves a fork pull request by its head sha", () => {
    const value = requiredChecksState()
    value.currentHeadSha = "fork-sha"
    value.openPullRequests = [openPullRequest(42, "fork-sha")]
    return Effect.gen(function* () {
      yield* runRequiredChecks(value, forkCheckRunEvent)
      expect(value.applies).toBe(1)
      expect(value.requestedPullRequests).toEqual([42])
    })
  })
  it.effect(
    "resolves a fork pull request from the second snapshot page",
    () => {
      const value = requiredChecksState()
      value.currentHeadSha = "fork-sha"
      value.openPullRequestPages.set(
        1,
        Array.from({ length: 100 }, (_, index) =>
          openPullRequest(1_000 + index, `other-${index}`),
        ),
      )
      value.openPullRequestPages.set(2, [openPullRequest(42, "fork-sha")])
      return Effect.gen(function* () {
        yield* runRequiredChecks(value, forkCheckRunEvent)
        expect(value.applies).toBe(1)
        expect(
          value.openPullRequestSnapshotCalls.map(({ page }) => page),
        ).toEqual([1, 2])
        expect(value.requestedPullRequests).toEqual([42])
      })
    },
  )
  it.effect("reuses the synchronized snapshot after a 304", () => {
    const value = requiredChecksState()
    value.currentHeadSha = "fork-sha"
    value.pullRequestSyncEtag = '"pulls-etag"'
    value.openPullRequestSnapshotNotModified = true
    value.cachedOpenPullRequests = [openPullRequest(42, "fork-sha")]
    return Effect.gen(function* () {
      yield* runRequiredChecks(value, forkCheckRunEvent)
      expect(value.applies).toBe(1)
      expect(value.openPullRequestSnapshotCalls).toEqual([
        { etag: '"pulls-etag"', page: 1 },
      ])
      expect(value.requestedPullRequests).toEqual([42])
    })
  })
  it.effect("continues from a full cached page after a 304", () => {
    const value = requiredChecksState()
    value.currentHeadSha = "fork-sha"
    value.pullRequestSyncEtag = '"pulls-etag"'
    value.openPullRequestSnapshotNotModified = true
    value.cachedOpenPullRequests = Array.from({ length: 100 }, (_, index) =>
      openPullRequest(1_000 + index, `other-${index}`),
    )
    value.openPullRequestPages.set(2, [openPullRequest(42, "fork-sha")])
    return Effect.gen(function* () {
      yield* runRequiredChecks(value, forkCheckRunEvent)
      expect(value.applies).toBe(1)
      expect(value.openPullRequestSnapshotCalls).toEqual([
        { etag: '"pulls-etag"', page: 1 },
        { etag: null, page: 2 },
      ])
    })
  })
  it.effect("retries page one live when a 304 has an empty cache", () => {
    const value = requiredChecksState()
    value.currentHeadSha = "fork-sha"
    value.pullRequestSyncEtag = '"pulls-etag"'
    value.openPullRequestSnapshotNotModified = true
    value.openPullRequests = [openPullRequest(42, "fork-sha")]
    return Effect.gen(function* () {
      yield* runRequiredChecks(value, forkCheckRunEvent)
      expect(value.applies).toBe(1)
      expect(value.openPullRequestSnapshotCalls).toEqual([
        { etag: '"pulls-etag"', page: 1 },
        { etag: null, page: 1 },
      ])
    })
  })
  it.effect("bounds an unmatched snapshot search at five pages", () => {
    const value = requiredChecksState()
    for (let page = 1; page <= 5; page++)
      value.openPullRequestPages.set(
        page,
        Array.from({ length: 100 }, (_, index) =>
          openPullRequest(page * 1_000 + index, `other-${page}-${index}`),
        ),
      )
    return Effect.gen(function* () {
      yield* runRequiredChecks(value, forkCheckRunEvent)
      expect(value.applies).toBe(0)
      expect(
        value.openPullRequestSnapshotCalls.map(({ page }) => page),
      ).toEqual([1, 2, 3, 4, 5])
    })
  })
  it.effect("continues when one payload pull request no longer exists", () => {
    const value = requiredChecksState()
    value.pullRequestStatuses.set(41, 404)
    return Effect.gen(function* () {
      yield* runRequiredChecks(value, checkRunWithMultiplePullRequestsEvent)
      expect(value.applies).toBe(1)
      expect(value.requestedPullRequests).toContain(41)
      expect(value.requestedPullRequests).toContain(42)
    })
  })
  it.effect(
    "fails when a payload pull request lookup has a server error",
    () => {
      const value = state()
      value.pullRequestStatuses.set(42, 500)
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          runRequiredChecks(value, checkRunWithPullRequestsEvent),
        )
        expect(error).toMatchObject({
          _tag: "LabelingCoordinatorError",
          cause: { _tag: "GitHubClientError", status: 500 },
        })
      })
    },
  )
  it.effect("fails when the commit lookup has a server error", () => {
    const value = state()
    value.commitLookupStatus = 500
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        runRequiredChecks(value, checkRunWithoutPullRequestsEvent),
      )
      expect(error).toMatchObject({
        _tag: "LabelingCoordinatorError",
        cause: { _tag: "GitHubClientError", status: 500 },
      })
    })
  })
  it.effect("fails when the open pull request snapshot is unavailable", () => {
    const value = state()
    value.openPullRequestSnapshotStatus = 500
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        runRequiredChecks(value, checkRunWithoutPullRequestsEvent),
      )
      expect(error).toMatchObject({
        _tag: "LabelingCoordinatorError",
        cause: { _tag: "GitHubClientError", status: 500 },
      })
    })
  })
  it.effect(
    "continues without evaluation when the snapshot failure is non-retryable",
    () => {
      const value = requiredChecksState()
      value.openPullRequestSnapshotStatus = 403
      return Effect.gen(function* () {
        yield* runRequiredChecks(value, checkRunWithoutPullRequestsEvent)
        expect(value.applies).toBe(0)
        expect(value.evaluations).toEqual([])
      })
    },
  )
  it.effect("warns and resolves a fork when commit lookup returns 422", () => {
    const value = requiredChecksState()
    const messages: Array<unknown> = []
    value.commitLookupStatus = 422
    value.currentHeadSha = "unknown-sha"
    value.openPullRequests = [openPullRequest(42, "unknown-sha")]
    return Effect.gen(function* () {
      yield* runRequiredChecks(value, checkRunWithoutPullRequestsEvent)
      expect(value.applies).toBe(1)
      expect(messages).toContainEqual([
        "Commit lookup returned 422, falling back to open pull request snapshot",
        expect.objectContaining({
          deliveryId: "unmatched-check-run",
          repository: "Effect-TS/effect",
          sha: "unknown-sha",
        }),
      ])
    }).pipe(
      Effect.provide(
        Logger.layer([
          Logger.make(({ message }) => {
            messages.push(message)
          }),
        ]),
      ),
    )
  })
  it.effect(
    "persists attribution before mutation and recovers on retry",
    () => {
      const value = state()
      value.failActionPersistence = true
      return Effect.gen(function* () {
        yield* Effect.flip(run(value))
        expect(value.applies).toBe(0)
        expect(value.actions).toEqual([])
        expect(value.operations).toEqual(["plan"])
        value.failActionPersistence = false
        value.operations.length = 0
        yield* run(value)
        expect(value.operations).toEqual(["plan", "github", "complete"])
        expect(value.actions).toMatchObject([{ selected: true }])
      })
    },
  )
  it.effect(
    "does not journal an action when the selected label is already present",
    () => {
      const value = state()
      value.labels.add("managed")
      return Effect.gen(function* () {
        yield* run(value)
        expect(value.applies).toBe(0)
        expect(value.actions).toEqual([])
        expect(value.completions).toEqual([])
        expect(value.operations).toEqual([])
      })
    },
  )
  it.effect(
    "expands a triggered conflict group and removes the losing label",
    () => {
      const siblingPolicyId = Schema.decodeUnknownSync(Policy.LabelingPolicyId)(
        "sibling-policy",
      )
      const siblingVersionId = Schema.decodeUnknownSync(
        Program.PolicyVersionId,
      )("sibling-version")
      const siblingPolicy = new Policy.LabelingPolicy({
        id: siblingPolicyId,
        repositoryId: policy.repositoryId,
        name: policy.name,
        target: policy.target,
        publishedVersionId: siblingVersionId,
        version: policy.version,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
        deletedAt: policy.deletedAt,
      })
      const groupedRule = new Rule.PolicyLabelingRule({
        _tag: "PolicyLabelingRule",
        id: rule.id,
        repositoryId: rule.repositoryId,
        policyId: rule.policyId,
        label: rule.label,
        onMatch: rule.onMatch,
        onNoMatch: rule.onNoMatch,
        conflictGroup: "change-kind",
        priority: rule.priority,
        enabled: rule.enabled,
        validationStatus: rule.validationStatus,
        validatedAt: rule.validatedAt,
        version: rule.version,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
        deletedAt: rule.deletedAt,
      })
      const siblingRule = new Rule.PolicyLabelingRule({
        _tag: "PolicyLabelingRule",
        id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("sibling-rule"),
        repositoryId: rule.repositoryId,
        policyId: siblingPolicyId,
        label: "sibling",
        onMatch: rule.onMatch,
        onNoMatch: "preserve",
        conflictGroup: "change-kind",
        priority: 10,
        enabled: rule.enabled,
        validationStatus: rule.validationStatus,
        validatedAt: rule.validatedAt,
        version: rule.version,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
        deletedAt: rule.deletedAt,
      })
      const baseVersion = version(deterministicProgram)
      const siblingVersion = new Policy.LabelingPolicyVersion({
        id: siblingVersionId,
        policyId: siblingPolicyId,
        repositoryId: baseVersion.repositoryId,
        revision: baseVersion.revision,
        program: baseVersion.program,
        contentHash: baseVersion.contentHash,
        registryManifest: baseVersion.registryManifest,
        triggerManifest: ["pull_request:opened"],
        publicationStatus: baseVersion.publicationStatus,
        createdAt: baseVersion.createdAt,
      })
      const value = state()
      value.labels.add("sibling")
      return Effect.gen(function* () {
        yield* run(value, deterministicProgram, {
          policies: [policy, siblingPolicy],
          versions: [version(deterministicProgram), siblingVersion],
          rules: [groupedRule, siblingRule],
        })
        expect([...value.labels].sort()).toEqual(["managed", "unmanaged"])
        expect(value.evaluations).toHaveLength(2)
        expect(value.factLoads).toBe(2)
        expect(value.actions).toMatchObject([
          { label: "managed", selected: true, action: "add" },
          { label: "sibling", selected: false, action: "remove" },
        ])
      })
    },
  )
  it.effect("skips repositories that are not configured", () => {
    const value = state()
    value.configured = false
    return Effect.gen(function* () {
      yield* run(value)
      expect(value.applies).toBe(0)
      expect(value.evaluations).toEqual([])
    })
  })
  it.effect("rejects stale automation revisions before mutation", () => {
    const value = state()
    value.revision = 8
    return Effect.gen(function* () {
      const error = yield* Effect.flip(run(value))
      expect(error.cause).toMatchObject({
        _tag: "LabelingCoordinatorSnapshotMismatch",
      })
      expect(value.applies).toBe(0)
    })
  })
  it.effect(
    "evaluates the current pull request state for stale redeliveries",
    () => {
      const value = state()
      value.currentTitle = "Changed"
      return Effect.gen(function* () {
        yield* run(value)
        expect(value.applies).toBe(1)
        expect([...value.labels].sort()).toEqual(["managed", "unmanaged"])
      })
    },
  )
  it.effect(
    "completes a failed label action when its label still exists",
    () => {
      const value = state()
      value.labelMutationFails = true
      return Effect.gen(function* () {
        yield* run(value)
        expect(value.markedMissing).toBe(0)
        expect(value.completions).toEqual([false])
      })
    },
  )
  it.effect(
    "completes partial actions before retrying a retryable label failure",
    () => {
      const value = state()
      value.labelMutationFails = true
      value.labelMutationRetryable = true
      return Effect.gen(function* () {
        const error = yield* Effect.flip(run(value))
        expect(error.cause).toMatchObject({
          _tag: "GitHubPullRequestLabelsError",
          label: "managed",
          status: 500,
          retryable: true,
        })
        expect(value.completions).toEqual([false])
      })
    },
  )
  it.effect(
    "completes a failed label action and marks its missing rule",
    () => {
      const value = state()
      value.labelMutationFails = true
      value.repositoryLabelExists = false
      return Effect.gen(function* () {
        yield* run(value)
        expect(value.markedMissing).toBe(1)
        expect(value.completions).toEqual([false])
        expect(value.operations).toEqual(["plan", "complete", "missing"])
      })
    },
  )
  it.effect("persists AI operational failures without mutating labels", () => {
    const value = state()
    value.aiFails = true
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        run(value, deterministicProgram, {
          policies: [],
          versions: [],
          rules: [aiRule()],
        }),
      )
      expect(error.cause).toMatchObject({ _tag: "PolicyAiError" })
      expect(value.applies).toBe(0)
      expect(value.evaluations).toMatchObject([
        {
          _tag: "AiRuleEvaluation",
          ruleId,
          ruleVersion: 1,
          outcome: "Error",
          confidence: 0,
          gateTrace: null,
        },
      ])
      expect(value.actions).toEqual([])
      expect([...value.labels]).toEqual(["unmanaged"])
    })
  })
  it.effect(
    "records fact-loading failures and fails the delivery for retry",
    () => {
      const value = state()
      value.factLoadingFailureAt = 1
      return Effect.gen(function* () {
        const error = yield* Effect.flip(run(value))
        expect(error.cause).toMatchObject({
          _tag: "GitHubClientError",
          retryable: true,
        })
        expect(value.evaluations).toMatchObject([
          { outcome: "Error", rationale: "Content unavailable." },
        ])
        expect(value.applies).toBe(0)
      })
    },
  )
  it.effect(
    "finishes other rule actions before failing a partial evaluation",
    () => {
      const value = state()
      value.factLoadingFailureAt = 1
      const secondRule = aiRule(null, {
        id: Schema.decodeUnknownSync(Rule.LabelingRuleId)("second-rule"),
        label: "second",
      })
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          run(value, deterministicProgram, {
            policies: [],
            versions: [],
            rules: [aiRule(), secondRule],
          }),
        )
        expect(error.cause).toMatchObject({
          _tag: "GitHubClientError",
          retryable: true,
        })
        expect(value.evaluations).toMatchObject([
          { outcome: "Error" },
          { outcome: "Match", ruleId: secondRule.id },
        ])
        expect([...value.labels].sort()).toEqual(["second", "unmanaged"])
        expect(value.applies).toBe(1)
      })
    },
  )
  it.effect("skips AI when its deterministic gate does not match", () => {
    const value = state()
    const noMatchProgram: Program.PolicyProgram = {
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        _tag: "FactPredicate",
        fact: "pull_request.draft",
        operator: "Equals",
        value: true,
      },
    }
    return Effect.gen(function* () {
      yield* run(value, noMatchProgram, {
        policies: [policy],
        versions: [version(noMatchProgram)],
        rules: [aiRule(policyId)],
      })
      expect(value.aiCalls).toBe(0)
      expect(value.evaluations).toMatchObject([
        {
          _tag: "AiRuleEvaluation",
          outcome: "Abstain",
          gatePolicyId: policyId,
          gatePolicyVersionId: versionId,
          gateTrace: [{ outcome: "NoMatch" }],
        },
      ])
      expect(value.actions).toEqual([])
    })
  })
})
