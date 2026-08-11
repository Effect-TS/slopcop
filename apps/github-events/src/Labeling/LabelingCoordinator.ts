import * as GitHubEvent from "@slopcop/domain/GitHub/GitHubEvent"
import type * as DomainRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as Evaluation from "@slopcop/domain/Labeling/PolicyEvaluation"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
import {
  GitHubClient,
  type PullRequestSummary,
} from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { OptionalPolicyAiLayer } from "@slopcop/labeling/Ai"
import { planLabelActions } from "@slopcop/labeling/LabelActions"
import { PolicyAi } from "@slopcop/labeling/PolicyAi"
import { evaluatePolicyProgram } from "@slopcop/labeling/PolicyEngine"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { PoliciesRepo } from "@slopcop/labeling/repositories/PoliciesRepo"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
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

const source = (event: GitHubWebhookEvent.GitHubWebhookEvent) => {
  switch (event.name) {
    case "pull_request":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.pull_request.head.sha,
        number: event.payload.number,
      }
    case "pull_request_review":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.pull_request.head.sha,
        number: event.payload.pull_request.number,
      }
    case "check_suite":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.check_suite.head_sha,
        number: null,
      }
    case "check_run":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.check_run.head_sha,
        number: null,
      }
    case "status":
      return {
        repository: event.payload.repository,
        installation: event.payload.installation,
        sha: event.payload.sha,
        number: null,
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
const decodeDeliveryId = Schema.decodeUnknownEffect(GitHubEvent.GitHubEventId)

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
    const resolver = {
      resolve: (id: Program.PolicyVersionId) =>
        policies.findResolvedVersion(id).pipe(
          Effect.map((version) =>
            version._tag === "Some"
              ? {
                  id: version.value.id,
                  policyId: version.value.policyId,
                  repositoryId: version.value.repositoryId,
                  target: version.value.target,
                  program: version.value.program,
                }
              : null,
          ),
        ),
    }

    const processPullRequest = Effect.fn(
      "LabelingCoordinator.processPullRequest",
    )(function* (
      event: GitHubWebhookEvent.GitHubWebhookEvent,
      repository: DomainRepository.GitHubRepository,
      summary: PullRequestSummary,
      trigger: string,
    ) {
      const policyRows = yield* policies.list(repository.id)
      const ruleSnapshot = yield* rules.getActiveSnapshot(repository.id)
      const ruleRows = ruleSnapshot.rules
      const active = yield* Effect.forEach(policyRows, (policy) =>
        policy.publishedVersionId === null
          ? Effect.succeed(null)
          : policies
              .findVersion(policy.publishedVersionId)
              .pipe(Effect.map((version) => ({ policy, version }))),
      ).pipe(Effect.map((entries) => entries.filter((entry) => entry !== null)))
      const boundPolicyIds = new Set(ruleRows.map((rule) => rule.policyId))
      const directlyTriggered = active.flatMap(({ policy, version }) =>
        version._tag === "Some" &&
        boundPolicyIds.has(policy.id) &&
        triggerMatches(version.value.triggerManifest, trigger)
          ? [{ policy, version: version.value }]
          : [],
      )
      const directlyTriggeredIds = new Set(
        directlyTriggered.map(({ policy }) => policy.id),
      )
      const triggeredConflictGroups = new Set(
        ruleRows.flatMap((rule) =>
          directlyTriggeredIds.has(rule.policyId) && rule.conflictGroup !== null
            ? [rule.conflictGroup]
            : [],
        ),
      )
      const expandedPolicyIds = new Set([
        ...directlyTriggeredIds,
        ...ruleRows.flatMap((rule) =>
          rule.conflictGroup !== null &&
          triggeredConflictGroups.has(rule.conflictGroup)
            ? [rule.policyId]
            : [],
        ),
      ])
      const triggered = active.flatMap(({ policy, version }) =>
        version._tag === "Some" && expandedPolicyIds.has(policy.id)
          ? [{ policy, version: version.value }]
          : [],
      )
      if (triggered.length > 20)
        return yield* new LabelingCoordinatorLimitExceeded({
          repository: repository.slug,
          limit: 20,
        })
      if (
        triggered.filter(({ version }) =>
          version.registryManifest.includes("ai:boolean-policy-v1"),
        ).length > 4
      )
        return yield* new LabelingCoordinatorLimitExceeded({
          repository: repository.slug,
          limit: 4,
        })
      const triggeredIds = new Set(triggered.map(({ policy }) => policy.id))
      const relevantRules = ruleRows.filter((rule) =>
        triggeredIds.has(rule.policyId),
      )
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
      const requiredFacts = new Set(
        triggered.flatMap(({ version }) => version.registryManifest),
      )
      const policyFacts = yield* facts.load(
        repository,
        summary,
        requiredFacts,
        currentLabels,
      )
      const decisions = new Map<string, Program.PolicyEvaluationResult>()
      const failures = new Map<
        string,
        import("@slopcop/labeling/PolicyEngine").PolicyOperationalError
      >()
      for (const { policy, version } of triggered) {
        const evaluated = yield* evaluatePolicyProgram({
          program: version.program,
          repositoryId: repository.id,
          facts: policyFacts,
          ai,
          resolver,
        }).pipe(
          Effect.match({
            onFailure: (error) => ({ _tag: "Failure" as const, error }),
            onSuccess: (decision) => ({
              _tag: "Success" as const,
              decision,
            }),
          }),
        )
        if (evaluated._tag === "Success")
          decisions.set(policy.id, evaluated.decision)
        else failures.set(policy.id, evaluated.error)
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
      const deliveryId = yield* decodeDeliveryId(event.id)
      const recordedEvaluations = new Map<string, Evaluation.PolicyEvaluation>()
      yield* Effect.forEach(
        triggered,
        ({ policy, version }) =>
          Effect.gen(function* () {
            const decision = decisions.get(policy.id)
            const failure = failures.get(policy.id)
            if (decision === undefined && failure === undefined) return
            const recorded = yield* evaluations.recordEvaluation(
              Evaluation.PolicyEvaluation.insert.make({
                deliveryId,
                repositoryId: repository.id,
                policyId: policy.id,
                policyVersionId: version.id,
                target: policy.target,
                subjectNumber: summary.number,
                headSha: summary.head.sha,
                automationRevision: ruleSnapshot.revision,
                outcome: decision?.outcome ?? "Error",
                confidence: decision?.confidence ?? 0,
                rationale:
                  decision?.rationale ??
                  failure?.message ??
                  "Policy evaluation failed.",
                trace: decision?.trace ?? [],
              }),
            )
            recordedEvaluations.set(policy.id, recorded)
          }),
        { discard: true },
      )
      const recordedActions = new Map<
        string,
        Evaluation.PolicyActionExecution
      >()
      yield* Effect.forEach(
        actions,
        (action) =>
          Effect.gen(function* () {
            const rule = relevantRules.find(
              (candidate) => candidate.id === action.ruleId,
            )
            if (rule === undefined) return
            const recorded = recordedEvaluations.get(rule.policyId)
            if (recorded === undefined || !decisions.has(rule.policyId)) return
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
                  return rule === undefined
                    ? Effect.fail(error)
                    : rules
                        .markMissing(repository.id, rule.id, rule.version)
                        .pipe(Effect.andThen(Effect.fail(error)))
                }),
              )
      yield* Effect.forEach(
        actions,
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
      const eventSource = source(event)
      const trigger = eventTrigger(event)
      if (eventSource === null || trigger === null) return
      const repository = yield* pullRequests
        .resolveRepository(eventSource.repository, eventSource.installation)
        .pipe(
          Effect.catchTag("RepositoryNotConfigured", () =>
            Effect.succeed(null),
          ),
        )
      if (repository === null) return
      const candidates = yield* github.listPullRequestsForCommit(
        repository,
        eventSource.sha,
      )
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
