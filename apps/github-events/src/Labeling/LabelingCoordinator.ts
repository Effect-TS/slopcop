import type * as DomainRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as Evaluation from "@slopcop/domain/Labeling/PolicyEvaluation"
import type * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import type * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
import {
  GitHubClient,
  type PullRequestSummary,
} from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { OptionalPolicyAiLayer } from "@slopcop/labeling/Ai"
import { evaluateAiLabelingRule } from "@slopcop/labeling/AiLabelingRuleEvaluator"
import { planLabelActions } from "@slopcop/labeling/LabelActions"
import { PolicyAi } from "@slopcop/labeling/PolicyAi"
import {
  compilePolicyProgram,
  triggersForPullRequestFacts,
  type CompiledPolicyProgram,
} from "@slopcop/labeling/PolicyCompiler"
import { evaluatePolicyProgram } from "@slopcop/labeling/PolicyEngine"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { PoliciesRepo } from "@slopcop/labeling/repositories/PoliciesRepo"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { GitHubPullRequest } from "../GitHub/GitHubPullRequest.ts"
import { PolicyEvaluationsRepo } from "./repositories/PolicyEvaluationsRepo.ts"

export class LabelingCoordinatorError extends Data.TaggedError(
  "LabelingCoordinatorError",
)<{ readonly deliveryId: string; readonly cause: unknown }> {}
export class LabelingCoordinatorSnapshotMismatch extends Data.TaggedError(
  "LabelingCoordinatorSnapshotMismatch",
)<{
  readonly repository: string
  readonly expectedRevision: number
  readonly actualRevision: number
}> {}
export class LabelingCoordinatorHeadChanged extends Data.TaggedError(
  "LabelingCoordinatorHeadChanged",
)<{
  readonly repository: string
  readonly number: number
  readonly expected: string
  readonly actual: string
}> {}
export class LabelingCoordinatorLimitExceeded extends Data.TaggedError(
  "LabelingCoordinatorLimitExceeded",
)<{ readonly repository: string; readonly limit: number }> {}

type RuntimeRule =
  | {
      readonly _tag: "Policy"
      readonly rule: Rule.PolicyLabelingRule
      readonly version: Policy.LabelingPolicyVersion
      readonly compiled: CompiledPolicyProgram
    }
  | {
      readonly _tag: "Ai"
      readonly rule: Rule.AiLabelingRule
      readonly gate: {
        readonly policy: Policy.LabelingPolicy
        readonly version: Policy.LabelingPolicyVersion
        readonly compiled: CompiledPolicyProgram
      } | null
    }

const source = (event: GitHubWebhookEvent.GitHubWebhookEvent) => {
  switch (event.name) {
    case "pull_request":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.pull_request.head.sha,
        number: event.payload.number,
        pullRequestNumbers: [],
      }
    case "pull_request_review":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.pull_request.head.sha,
        number: event.payload.pull_request.number,
        pullRequestNumbers: [],
      }
    case "check_suite":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.check_suite.head_sha,
        number: null,
        pullRequestNumbers: (event.payload.check_suite.pull_requests ?? []).map(
          (pullRequest) => pullRequest.number,
        ),
      }
    case "check_run":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.check_run.head_sha,
        number: null,
        pullRequestNumbers: (event.payload.check_run.pull_requests ?? []).map(
          (pullRequest) => pullRequest.number,
        ),
      }
    case "status":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.sha,
        number: null,
        pullRequestNumbers: [],
      }
    case "ping":
    case "installation":
    case "installation_repositories":
      return null
  }
}

export const eventTrigger = (event: GitHubWebhookEvent.GitHubWebhookEvent) => {
  if (
    event.name === "ping" ||
    event.name === "installation" ||
    event.name === "installation_repositories"
  )
    return null
  const action = "action" in event.payload ? event.payload.action : "*"
  return `${event.name}:${action}`
}
export const triggerMatches = (
  manifest: ReadonlyArray<string>,
  trigger: string,
) => {
  const separator = trigger.indexOf(":")
  const wildcard = `${trigger.slice(0, separator)}:*`
  return manifest.includes(trigger) || manifest.includes(wildcard)
}
const policyReferences = (
  condition: Program.Condition,
): ReadonlyArray<Program.PolicyId> => {
  switch (condition._tag) {
    case "PolicyReference":
      return [condition.policyId]
    case "All":
    case "Any":
      return condition.conditions.flatMap(policyReferences)
    case "Not":
      return policyReferences(condition.condition)
    default:
      return []
  }
}

export class LabelingCoordinator extends Context.Service<
  LabelingCoordinator,
  {
    readonly process: (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) => Effect.Effect<void, LabelingCoordinatorError>
  }
>()("@slopcop/github-events/Labeling/LabelingCoordinator", {
  make: Effect.gen(function* () {
    const github = yield* GitHubClient
    const pullRequests = yield* GitHubPullRequest
    const repositories = yield* GitHubRepositoriesRepo
    const policies = yield* PoliciesRepo
    const rules = yield* LabelingRules
    const ai = yield* PolicyAi
    const facts = yield* PolicyFacts
    const evaluations = yield* PolicyEvaluationsRepo
    const resolvePullRequestNumbers = (
      repository: DomainRepository.GitHubRepository,
      numbers: ReadonlyArray<number>,
    ) =>
      Effect.forEach(
        numbers,
        (number) =>
          github
            .getPullRequest(repository, number)
            .pipe(
              Effect.catchTag("GitHubClientError", (error) =>
                error.status === 404
                  ? Effect.succeed(null)
                  : Effect.fail(error),
              ),
            ),
        { concurrency: 2 },
      ).pipe(
        Effect.map((candidates) =>
          candidates.filter(
            (candidate): candidate is PullRequestSummary => candidate !== null,
          ),
        ),
      )
    const processPullRequest = Effect.fn(
      "LabelingCoordinator.processPullRequest",
    )(function* (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
      repository: DomainRepository.GitHubRepository,
      summary: PullRequestSummary,
      trigger: string,
    ) {
      const ruleSnapshot = yield* rules.getActiveSnapshot(repository.id)
      const policyRows = yield* policies.list(repository.id)
      const ruleRows = ruleSnapshot.rules
      const active = yield* Effect.forEach(policyRows, (policy) =>
        policy.publishedVersionId === null
          ? Effect.succeed(null)
          : policies
              .findVersion(policy.publishedVersionId)
              .pipe(Effect.map((version) => ({ policy, version }))),
      ).pipe(Effect.map((entries) => entries.filter((entry) => entry !== null)))
      const activeByPolicyId = new Map(
        active.flatMap(({ policy, version }) =>
          version._tag === "Some"
            ? [[policy.id, { policy, version: version.value }]]
            : [],
        ),
      )
      const snapshotByReference = new Map<
        string,
        {
          readonly id: Program.PolicyVersionId
          readonly policyId: Program.PolicyId
          readonly repositoryId: string
          readonly target: Program.PolicyTarget
          readonly program: Program.PolicyProgram
        }
      >()
      for (const { policy, version } of activeByPolicyId.values()) {
        const resolved = {
          id: version.id,
          policyId: policy.id,
          repositoryId: policy.repositoryId,
          target: policy.target,
          program: version.program,
        }
        snapshotByReference.set(policy.id, resolved)
        snapshotByReference.set(version.id, resolved)
      }
      const referencedIds = new Set(
        active.flatMap(({ version }) => [
          ...(version._tag === "None" ||
          version.value.program.appliesWhen === null
            ? []
            : policyReferences(version.value.program.appliesWhen)),
          ...(version._tag === "None"
            ? []
            : policyReferences(version.value.program.matchesWhen)),
        ]),
      )
      for (const id of referencedIds) {
        if (snapshotByReference.has(id)) continue
        const current = yield* policies.findCurrentVersion(id)
        if (current._tag === "Some") {
          const resolved = snapshotByReference.get(current.value.policyId)
          if (resolved !== undefined) snapshotByReference.set(id, resolved)
        }
      }
      const resolver = {
        resolve: (id: Program.PolicyId) =>
          Effect.succeed(snapshotByReference.get(id) ?? null),
      }
      const compiledByPolicyId = new Map<
        Program.PolicyId,
        CompiledPolicyProgram
      >()
      for (const { policy, version } of activeByPolicyId.values())
        compiledByPolicyId.set(
          policy.id,
          yield* compilePolicyProgram(version.program, resolver, {
            repositoryId: repository.id,
            policyId: policy.id,
          }),
        )
      const runtimeRules: Array<RuntimeRule> = []
      for (const rule of ruleRows) {
        if (rule._tag === "PolicyLabelingRule") {
          const resolved = activeByPolicyId.get(rule.policyId)
          const compiled = compiledByPolicyId.get(rule.policyId)
          if (resolved !== undefined && compiled !== undefined)
            runtimeRules.push({
              _tag: "Policy",
              rule,
              version: resolved.version,
              compiled,
            })
        } else if (rule.gatePolicyId === null)
          runtimeRules.push({ _tag: "Ai", rule, gate: null })
        else {
          const gate = activeByPolicyId.get(rule.gatePolicyId)
          const compiled = compiledByPolicyId.get(rule.gatePolicyId)
          if (gate !== undefined && compiled !== undefined)
            runtimeRules.push({
              _tag: "Ai",
              rule,
              gate: { ...gate, compiled },
            })
        }
      }
      const triggers = (runtime: RuntimeRule): ReadonlyArray<string> =>
        runtime._tag === "Policy"
          ? runtime.compiled.triggers
          : [
              ...triggersForPullRequestFacts(runtime.rule.evidence),
              ...(runtime.gate?.compiled.triggers ?? []),
            ]
      const directlyTriggeredIds = new Set(
        runtimeRules
          .filter((runtime) => triggerMatches(triggers(runtime), trigger))
          .map(({ rule }) => rule.id),
      )
      const triggeredConflictGroups = new Set(
        runtimeRules.flatMap(({ rule }) =>
          directlyTriggeredIds.has(rule.id) && rule.conflictGroup !== null
            ? [rule.conflictGroup]
            : [],
        ),
      )
      const expandedRuleIds = new Set([
        ...directlyTriggeredIds,
        ...runtimeRules.flatMap(({ rule }) =>
          rule.conflictGroup !== null &&
          triggeredConflictGroups.has(rule.conflictGroup)
            ? [rule.id]
            : [],
        ),
      ])
      const relevant = runtimeRules.filter(({ rule }) =>
        expandedRuleIds.has(rule.id),
      )
      if (relevant.length > 20)
        return yield* new LabelingCoordinatorLimitExceeded({
          repository: repository.slug,
          limit: 20,
        })
      if (relevant.filter((runtime) => runtime._tag === "Ai").length > 4)
        return yield* new LabelingCoordinatorLimitExceeded({
          repository: repository.slug,
          limit: 4,
        })
      const relevantRules = relevant.map(({ rule }) => rule)
      if (relevantRules.length === 0) return
      const currentLabels = yield* pullRequests.getLabels({
        deliveryId: event.id,
        repository,
        number: summary.number,
        title: summary.title,
        body: summary.body,
        baseRef: summary.base.ref,
        headSha: summary.head.sha,
      })
      const decisions = new Map<string, Program.PolicyEvaluationResult>()
      const failures = new Map<string, { readonly message: string }>()
      const gateDecisions = new Map<string, Program.PolicyEvaluationResult>()
      for (const runtime of relevant) {
        const evaluation = Effect.gen(function* () {
          const policyFacts = yield* facts.load(
            repository,
            summary,
            {
              facts: new Set(
                runtime._tag === "Policy"
                  ? runtime.compiled.facts
                  : [
                      ...runtime.rule.evidence,
                      ...(runtime.gate?.compiled.facts ?? []),
                    ],
              ),
              changedFileContentSelectors:
                runtime._tag === "Policy"
                  ? runtime.compiled.changedFileContentSelectors
                  : (runtime.gate?.compiled.changedFileContentSelectors ?? []),
            },
            currentLabels,
          )
          if (runtime._tag === "Policy")
            return yield* evaluatePolicyProgram({
              program: runtime.version.program,
              repositoryId: repository.id,
              facts: policyFacts,
              resolver,
            })
          if (runtime.gate !== null) {
            const gate = yield* evaluatePolicyProgram({
              program: runtime.gate.version.program,
              repositoryId: repository.id,
              facts: policyFacts,
              resolver,
            })
            gateDecisions.set(runtime.rule.id, gate)
            if (gate.outcome !== "Match")
              return {
                outcome: "Abstain",
                confidence: gate.confidence,
                rationale: `AI gate ${gate.outcome === "NoMatch" ? "did not match" : "abstained"}.`,
                trace: [],
              } satisfies Program.PolicyEvaluationResult
          }
          return yield* evaluateAiLabelingRule({
            rule: runtime.rule,
            facts: policyFacts,
            ai,
          })
        })
        const evaluated = yield* evaluation.pipe(
          Effect.match({
            onFailure: (error) => ({ _tag: "Failure" as const, error }),
            onSuccess: (decision) => ({
              _tag: "Success" as const,
              decision,
            }),
          }),
        )
        if (evaluated._tag === "Success")
          decisions.set(runtime.rule.id, evaluated.decision)
        else failures.set(runtime.rule.id, evaluated.error)
      }
      const actions = planLabelActions(relevantRules, decisions, currentLabels)
      const currentRevision = yield* repositories.getRulesRevision(
        repository.id,
      )
      if (currentRevision !== ruleSnapshot.revision)
        return yield* new LabelingCoordinatorSnapshotMismatch({
          repository: repository.slug,
          expectedRevision: ruleSnapshot.revision,
          actualRevision: currentRevision,
        })
      const current = yield* github.getPullRequest(repository, summary.number)
      if (
        current.head.sha !== summary.head.sha ||
        current.title !== summary.title ||
        current.body !== summary.body ||
        current.draft !== summary.draft ||
        current.base.ref !== summary.base.ref
      )
        return yield* new LabelingCoordinatorHeadChanged({
          repository: repository.slug,
          number: summary.number,
          expected: summary.head.sha,
          actual: current.head.sha,
        })
      const deliveryId = event.id
      const recordedEvaluations = new Map<string, Evaluation.PolicyEvaluation>()
      yield* Effect.forEach(
        relevant,
        (runtime) =>
          Effect.gen(function* () {
            const decision = decisions.get(runtime.rule.id)
            const failure = failures.get(runtime.rule.id)
            if (decision === undefined && failure === undefined) return
            const outcome: typeof Program.PolicyEvaluationOutcome.Type =
              decision?.outcome ?? "Error"
            const shared = {
              deliveryId,
              repositoryId: repository.id,
              ruleId: runtime.rule.id,
              ruleVersion: runtime.rule.version,
              target: "pull_request" as const,
              subjectNumber: summary.number,
              headSha: summary.head.sha,
              automationRevision: ruleSnapshot.revision,
              outcome,
              confidence: decision?.confidence ?? 0,
              rationale:
                decision?.rationale ??
                failure?.message ??
                "Rule evaluation failed.",
            }
            const persistedTrace: Parameters<
              typeof Evaluation.PolicyRuleEvaluation.insert.make
            >[0]["trace"] = (decision?.trace ?? []).map((entry) => ({
              location: {
                root: entry.location.root,
                path: entry.location.path.map((segment) => ({ ...segment })),
              },
              outcome: entry.outcome,
              rationale: entry.rationale,
            }))
            const gateDecision = gateDecisions.get(runtime.rule.id)
            const persistedGateTrace: Parameters<
              typeof Evaluation.AiRuleEvaluation.insert.make
            >[0]["gateTrace"] =
              gateDecision === undefined
                ? null
                : gateDecision.trace.map((entry) => ({
                    location: {
                      root: entry.location.root,
                      path: entry.location.path.map((segment) => ({
                        ...segment,
                      })),
                    },
                    outcome: entry.outcome,
                    rationale: entry.rationale,
                  }))
            let input: typeof Evaluation.PolicyEvaluation.insert.Type
            if (runtime._tag === "Policy") {
              const policyInput: Parameters<
                typeof Evaluation.PolicyRuleEvaluation.insert.make
              >[0] = {
                _tag: "PolicyRuleEvaluation",
                deliveryId: shared.deliveryId,
                repositoryId: shared.repositoryId,
                ruleId: shared.ruleId,
                ruleVersion: shared.ruleVersion,
                target: shared.target,
                subjectNumber: shared.subjectNumber,
                headSha: shared.headSha,
                automationRevision: shared.automationRevision,
                outcome: shared.outcome,
                confidence: shared.confidence,
                rationale: shared.rationale,
                policyId: runtime.rule.policyId,
                policyVersionId: runtime.version.id,
                trace: persistedTrace,
              }
              input = Evaluation.PolicyRuleEvaluation.insert.make(policyInput)
            } else {
              const aiInput: Parameters<
                typeof Evaluation.AiRuleEvaluation.insert.make
              >[0] = {
                _tag: "AiRuleEvaluation",
                deliveryId: shared.deliveryId,
                repositoryId: shared.repositoryId,
                ruleId: shared.ruleId,
                ruleVersion: shared.ruleVersion,
                target: shared.target,
                subjectNumber: shared.subjectNumber,
                headSha: shared.headSha,
                automationRevision: shared.automationRevision,
                outcome: shared.outcome,
                confidence: shared.confidence,
                rationale: shared.rationale,
                evaluator: runtime.rule.evaluator,
                gatePolicyId: runtime.rule.gatePolicyId,
                gatePolicyVersionId: runtime.gate?.version.id ?? null,
                gateTrace: persistedGateTrace,
              }
              input = Evaluation.AiRuleEvaluation.insert.make(aiInput)
            }
            const recorded = yield* evaluations.recordEvaluation(input)
            recordedEvaluations.set(runtime.rule.id, recorded)
          }),
        { discard: true },
      )
      const recordedActions = new Map<
        string,
        Evaluation.PolicyActionExecution
      >()
      yield* Effect.forEach(
        actions.filter((action) => action.action !== "preserve"),
        (action) =>
          Effect.gen(function* () {
            const recorded = recordedEvaluations.get(action.ruleId)
            if (recorded === undefined || !decisions.has(action.ruleId)) return
            const execution = yield* evaluations.recordAction(
              Evaluation.PolicyActionExecution.insert.make({
                evaluationId: recorded.id,
                repositoryId: repository.id,
                ruleId: action.ruleId,
                action: action.action,
                label: action.label,
                selected: action.selected,
                status: "planned",
                applied: false,
              }),
            )
            recordedActions.set(action.ruleId, execution)
          }),
        { discard: true },
      )
      const changes = {
        add: actions
          .filter((action) => action.action === "add")
          .map((action) => action.label),
        remove: actions
          .filter((action) => action.action === "remove")
          .map((action) => action.label),
      }
      const applied =
        changes.add.length === 0 && changes.remove.length === 0
          ? { added: [], removed: [] }
          : yield* pullRequests
              .applyLabels(
                {
                  deliveryId: event.id,
                  repository,
                  number: summary.number,
                  title: summary.title,
                  body: summary.body,
                  baseRef: summary.base.ref,
                  headSha: summary.head.sha,
                },
                changes,
              )
              .pipe(
                Effect.catchTag("GitHubPullRequestLabelsError", (error) => {
                  if (error.label === undefined) return Effect.fail(error)
                  const rule = relevantRules.find(
                    (candidate) =>
                      candidate.label.toLowerCase() ===
                      error.label?.toLowerCase(),
                  )
                  if (rule === undefined) return Effect.fail(error)
                  return github
                    .getRepositoryLabel(repository, error.label)
                    .pipe(
                      Effect.matchEffect({
                        onFailure: () => Effect.void,
                        onSuccess: Option.match({
                          onNone: () =>
                            rules.markMissing(
                              repository.id,
                              rule.id,
                              rule.version,
                            ),
                          onSome: () => Effect.void,
                        }),
                      }),
                      Effect.andThen(Effect.fail(error)),
                    )
                }),
              )
      yield* Effect.forEach(
        actions.filter((action) => action.action !== "preserve"),
        (action) => {
          const execution = recordedActions.get(action.ruleId)
          if (execution === undefined) return Effect.void
          return evaluations.completeAction(
            execution.id,
            action.action === "add"
              ? applied.added.includes(action.label)
              : action.action === "remove" &&
                  applied.removed.includes(action.label),
          )
        },
        { discard: true },
      )
    })

    const run = Effect.fn("LabelingCoordinator.process")(function* (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
    ) {
      const trigger = eventTrigger(event)
      if (trigger === null) return
      if (event.name === "pull_request") {
        const repository = yield* pullRequests
          .resolveRepository(
            event.payload.repository,
            event.payload.installation,
          )
          .pipe(
            Effect.catchTag("RepositoryNotConfigured", () =>
              Effect.succeed(null),
            ),
          )
        if (repository === null) return
        const summary = yield* github.getPullRequest(
          repository,
          event.payload.number,
        )
        return yield* processPullRequest(event, repository, summary, trigger)
      }
      const eventSource = source(event)
      if (eventSource === null) return
      const repository = yield* pullRequests
        .resolveRepository(eventSource.repository, eventSource.installation)
        .pipe(
          Effect.catchTag("RepositoryNotConfigured", () =>
            Effect.succeed(null),
          ),
        )
      if (repository === null) return
      let candidates = yield* eventSource.pullRequestNumbers.length > 0
        ? resolvePullRequestNumbers(repository, eventSource.pullRequestNumbers)
        : github.listPullRequestsForCommit(repository, eventSource.sha).pipe(
            Effect.catchTag("GitHubClientError", (error) =>
              error.status === 422
                ? Effect.logWarning(
                    "Commit did not resolve to a pull request",
                    {
                      deliveryId: event.id,
                      repository: repository.slug,
                      sha: eventSource.sha,
                    },
                  ).pipe(Effect.as([] as ReadonlyArray<PullRequestSummary>))
                : Effect.fail(error),
            ),
          )
      if (candidates.length === 0) {
        const snapshot = yield* github.listOpenPullRequestSnapshot(
          repository,
          null,
        )
        if (snapshot._tag === "Modified")
          candidates = yield* resolvePullRequestNumbers(
            repository,
            snapshot.value
              .filter((pullRequest) => pullRequest.headSha === eventSource.sha)
              .map((pullRequest) => pullRequest.number),
          )
      }
      const current = candidates.filter(
        (candidate) =>
          candidate.head.sha === eventSource.sha &&
          (eventSource.number === null ||
            candidate.number === eventSource.number),
      )
      yield* Effect.forEach(
        current,
        (summary) => processPullRequest(event, repository, summary, trigger),
        { concurrency: 2, discard: true },
      )
    })
    return {
      process: (event) =>
        run(event).pipe(
          Effect.mapError(
            (cause) =>
              new LabelingCoordinatorError({ deliveryId: event.id, cause }),
          ),
        ),
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
}

export const LabelingCoordinatorLayer = LabelingCoordinator.layerNoDeps.pipe(
  Layer.provide([
    GitHubClient.layer,
    GitHubPullRequest.layer,
    GitHubRepositoriesRepo.layer,
    PoliciesRepo.layer,
    LabelingRules.layer,
    PolicyEvaluationsRepo.layer,
    OptionalPolicyAiLayer,
    PolicyFacts.layer,
  ]),
)
