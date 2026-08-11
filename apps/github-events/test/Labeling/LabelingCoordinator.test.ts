import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Webhook from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Evaluation from "@slopcop/domain/Labeling/PolicyEvaluation"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import { UnexpectedRowCount } from "@slopcop/infra/Sql/RepositoryError"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { OptionalPolicyAiLayer } from "@slopcop/labeling/Ai"
import { PolicyAi, PolicyAiError } from "@slopcop/labeling/PolicyAi"
import { evaluatePolicyProgram } from "@slopcop/labeling/PolicyEngine"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
import { PoliciesRepo } from "@slopcop/labeling/repositories/PoliciesRepo"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { GitHubPullRequest } from "../../src/GitHub/GitHubPullRequest.ts"
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
const version = (program: Program.PolicyProgram) =>
  new Policy.LabelingPolicyVersion({
    id: versionId,
    policyId,
    repositoryId: repository.id,
    revision: 1,
    program,
    contentHash: "hash",
    registryManifest: ["pull_request.draft"],
    triggerManifest: ["pull_request:unlabeled"],
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
const aiRule = (gatePolicyId: Policy.LabelingPolicy["id"] | null = null) =>
  new Rule.AiLabelingRule({
    _tag: "AiLabelingRule",
    id: ruleId,
    repositoryId: repository.id,
    label: "managed",
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
interface State {
  configured: boolean
  revision: number
  currentTitle: string
  aiFails: boolean
  aiCalls: number
  labels: Set<string>
  applies: number
  markedMissing: number
  failActionPersistence: boolean
  operations: Array<string>
  completions: Array<boolean>
  evaluations: Array<typeof Evaluation.PolicyEvaluation.insert.Type>
  actions: Array<typeof Evaluation.PolicyActionExecution.insert.Type>
}
const state = (): State => ({
  configured: true,
  revision: 7,
  currentTitle: "Fix",
  aiFails: false,
  aiCalls: 0,
  labels: new Set(["unmanaged"]),
  applies: 0,
  markedMissing: 0,
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
          getRepositoryLabel: () => unavailable,
          listRepositoryLabels: () => unavailableStream,
          listPullRequestFiles: () => unavailableStream,
          listOpenPullRequests: () => unavailable,
          getPullRequest: () =>
            Effect.succeed({ ...summary, title: value.currentTitle }),
          listItemLabels: () => unavailableStream,
          addItemLabels: () => unavailable,
          removeItemLabel: () => unavailable,
          listPullRequestsForCommit: () => Effect.succeed([summary]),
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
            Effect.sync(() => {
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
              return { added, removed }
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
          findResolvedVersion: () =>
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
          insertVersion: () => unavailable,
          insertDependencies: () => unavailable,
          insertTriggers: () => unavailable,
          publish: () => unavailable,
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
            Effect.succeed({
              repositoryId: repository.id,
              repository: repository.slug,
              revision: 7,
              rules: scenario?.rules ?? [rule],
            }),
          assertRevision: () => unavailable,
          listAvailableLabels: () => unavailable,
          validateCandidateLabel: () => unavailable,
          markMissing: () =>
            Effect.sync(() => {
              value.markedMissing++
            }),
          revalidateStaleBatch: () => unavailable,
        }),
        Layer.succeed(PolicyFacts, {
          load: () =>
            Effect.succeed({
              draft: false,
              title: "Fix",
              body: null,
              baseRef: "main",
              headSha: "sha",
              currentLabels: [...value.labels],
              changedFiles: null,
              changedFilesComplete: null,
              requiredChecks: null,
              latestReviews: null,
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
) =>
  Effect.gen(function* () {
    yield* (yield* LabelingCoordinator).process(event)
  }).pipe(Effect.provide(layer(value, program, scenario)))

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
    "attributes a selected rule when its label is already present",
    () => {
      const value = state()
      value.labels.add("managed")
      return Effect.gen(function* () {
        yield* run(value)
        expect(value.applies).toBe(0)
        expect(value.actions).toMatchObject([
          { action: "preserve", selected: true, status: "planned" },
        ])
        expect(value.completions).toEqual([false])
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
  it.effect("rejects changed pull request state before mutation", () => {
    const value = state()
    value.currentTitle = "Changed"
    return Effect.gen(function* () {
      const error = yield* Effect.flip(run(value))
      expect(error.cause).toMatchObject({
        _tag: "LabelingCoordinatorHeadChanged",
      })
      expect(value.applies).toBe(0)
    })
  })
  it.effect("persists AI operational failures without mutating labels", () => {
    const value = state()
    value.aiFails = true
    return Effect.gen(function* () {
      yield* run(value, deterministicProgram, {
        policies: [],
        versions: [],
        rules: [aiRule()],
      })
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
      expect(value.actions).toMatchObject([{ action: "preserve" }])
    })
  })
})
