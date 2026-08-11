import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import * as Audit from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import * as Management from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import { GitHubClient, GitHubClientError } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import {
  GitHubLabelValidationError,
  InvalidLabelingRule,
  LabelingRuleConflict,
  LabelingRuleNotFound,
  StaleLabelingRulesRevision,
} from "./LabelingRuleErrors.ts"
import {
  makeLabelingRuleCommands,
  type LabelingRuleCommandResult,
} from "./LabelingRuleCommands.ts"
import {
  LabelingRuleAuditLogRepo,
  type LabelingRuleAuditActivityRow,
} from "./repositories/LabelingRuleAuditLogRepo.ts"
import {
  LabelingRulesRepo,
  type ListRulesOptions,
} from "./repositories/LabelingRulesRepo.ts"
import { LabelingRuleStatsRepo } from "./repositories/LabelingRuleStatsRepo.ts"
import { PoliciesRepo } from "./repositories/PoliciesRepo.ts"

export interface AdminIdentity {
  readonly actor: string
}
export interface LabelingRuleSet {
  readonly repositoryId: GitHubRepository.GitHubRepository["id"]
  readonly repository: string
  readonly revision: number
  readonly rules: ReadonlyArray<Rule.LabelingRule>
}
export interface ManagedLabelingRuleSet extends LabelingRuleSet {
  readonly activity: {
    readonly windowDays: 30
    readonly totalFires: number
    readonly rules: ReadonlyArray<{
      readonly ruleId: Rule.LabelingRule["id"]
      readonly fires: number
    }>
  }
}
export interface LabelingRuleAuditPage {
  readonly entries: ReadonlyArray<Audit.LabelingRuleAuditEntry>
  readonly nextCursor: {
    readonly createdAt: number
    readonly id: Audit.LabelingRuleAuditEntry["id"]
  } | null
}
export interface LabelingRuleActivityPage {
  readonly entries: ReadonlyArray<LabelingRuleAuditActivityRow>
  readonly nextCursor: LabelingRuleAuditPage["nextCursor"]
}
export interface ListRuleAuditOptions {
  readonly ruleId: Rule.LabelingRule["id"] | null
  readonly operation: Audit.LabelingRuleAuditEntry["operation"] | null
  readonly cursor: LabelingRuleAuditPage["nextCursor"]
  readonly limit: number
}
export interface ListRuleActivityOptions {
  readonly repository: string | null
  readonly operation: Audit.LabelingRuleAuditEntry["operation"] | null
  readonly cursor: LabelingRuleAuditPage["nextCursor"]
  readonly limit: number
}
export type LabelingRulesError =
  | RepositoryNotConfigured
  | GitHubLabelValidationError
  | LabelingRuleNotFound
  | LabelingRuleConflict
  | StaleLabelingRulesRevision
  | import("./LabelingRuleErrors.ts").DuplicateLabelingRule
  | import("./LabelingRuleErrors.ts").InvalidLabelingRule
  | import("@slopcop/github/repositories/GitHubRepositoriesRepo").GitHubRepositoriesRepoError
  | import("./repositories/LabelingRulesRepo.ts").LabelingRulesRepoError
  | import("./repositories/LabelingRuleAuditLogRepo.ts").LabelingRuleAuditLogRepoError
  | import("./repositories/LabelingRuleStatsRepo.ts").LabelingRuleStatsRepoError
  | import("./repositories/PoliciesRepo.ts").PoliciesRepoError
  | import("effect/unstable/sql/SqlError").SqlError

type Slug = GitHubRepository.GitHubRepositorySlug
const actor = (identity: AdminIdentity) => ({
  _tag: "Administrator" as const,
  actor: identity.actor,
})

export class LabelingRules extends Context.Service<
  LabelingRules,
  {
    readonly list: (
      slug: Slug,
      options: ListRulesOptions,
    ) => Effect.Effect<ManagedLabelingRuleSet, LabelingRulesError>
    readonly get: (
      slug: Slug,
      id: Rule.LabelingRule["id"],
    ) => Effect.Effect<Rule.LabelingRule, LabelingRulesError>
    readonly listAudit: (
      slug: Slug,
      options: ListRuleAuditOptions,
    ) => Effect.Effect<LabelingRuleAuditPage, LabelingRulesError>
    readonly listActivity: (
      options: ListRuleActivityOptions,
    ) => Effect.Effect<LabelingRuleActivityPage, LabelingRulesError>
    readonly create: (
      slug: Slug,
      input: Management.CreateLabelingRuleRequest,
      identity: AdminIdentity,
    ) => Effect.Effect<Rule.LabelingRule, LabelingRulesError>
    readonly update: (
      slug: Slug,
      id: Rule.LabelingRule["id"],
      input: Management.PatchLabelingRuleRequest,
      identity: AdminIdentity,
    ) => Effect.Effect<Rule.LabelingRule, LabelingRulesError>
    readonly revalidate: (
      slug: Slug,
      id: Rule.LabelingRule["id"],
      identity: AdminIdentity,
    ) => Effect.Effect<Rule.LabelingRule, LabelingRulesError>
    readonly disable: (
      slug: Slug,
      id: Rule.LabelingRule["id"],
      version: number,
      identity: AdminIdentity,
    ) => Effect.Effect<Rule.LabelingRule, LabelingRulesError>
    readonly remove: (
      slug: Slug,
      id: Rule.LabelingRule["id"],
      version: number,
      identity: AdminIdentity,
    ) => Effect.Effect<void, LabelingRulesError>
    readonly getActiveSnapshot: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
    ) => Effect.Effect<LabelingRuleSet, LabelingRulesError>
    readonly assertRevision: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      expected: number,
    ) => Effect.Effect<void, LabelingRulesError>
    readonly listAvailableLabels: (
      slug: Slug,
    ) => Effect.Effect<
      ReadonlyArray<GitHubLabel.GitHubLabel>,
      LabelingRulesError
    >
    readonly validateCandidateLabel: (
      slug: Slug,
      label: GitHubLabel.GitHubLabelName,
    ) => Effect.Effect<
      GitHubLabel.GitHubLabelValidationResult,
      LabelingRulesError
    >
    readonly markMissing: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      id: Rule.LabelingRule["id"],
      version: number,
    ) => Effect.Effect<void, LabelingRulesError>
    readonly revalidateStaleBatch: (options: {
      readonly validatedBefore: DateTime.Utc
      readonly limit: number
    }) => Effect.Effect<
      {
        readonly processed: number
        readonly valid: number
        readonly missing: number
        readonly failed: number
      },
      LabelingRulesError
    >
  }
>()("@slopcop/labeling/LabelingRules", {
  make: Effect.gen(function* () {
    const repositories = yield* GitHubRepositoriesRepo
    const rules = yield* LabelingRulesRepo
    const policies = yield* PoliciesRepo
    const stats = yield* LabelingRuleStatsRepo
    const audit = yield* LabelingRuleAuditLogRepo
    const github = yield* GitHubClient
    const execute = yield* makeLabelingRuleCommands
    const validationTtl = yield* Config.duration(
      "LABELING_RULE_VALIDATION_TTL",
    ).pipe(Config.withDefault(Duration.hours(24)))
    const repository = Effect.fn("LabelingRules.repository")(function* (
      slug: Slug,
    ) {
      const found = yield* repositories.findBySlug(slug)
      if (Option.isNone(found))
        return yield* new RepositoryNotConfigured({
          repository: `${slug.owner}/${slug.repo}`,
        })
      return found.value
    })
    const requireRule = Effect.fn("LabelingRules.requireRule")(function* (
      repo: GitHubRepository.GitHubRepository,
      id: Rule.LabelingRule["id"],
    ) {
      const found = yield* rules.findById(repo.id, id)
      if (Option.isNone(found))
        return yield* new LabelingRuleNotFound({
          repository: repo.slug,
          ruleId: id,
        })
      return found.value
    })
    const requirePolicy = Effect.fn("LabelingRules.requirePolicy")(function* (
      repo: GitHubRepository.GitHubRepository,
      policyId: Rule.PolicyLabelingRule["policyId"],
      requirePublished: boolean,
    ) {
      const found = yield* policies.find(repo.id, policyId)
      if (Option.isNone(found))
        return yield* new InvalidLabelingRule({
          message: `Policy '${policyId}' does not exist in ${repo.slug}.`,
        })
      if (requirePublished && found.value.publishedVersionId === null)
        return yield* new InvalidLabelingRule({
          message: "The labeling rule requires a published policy.",
        })
    })
    const mapGitHubError =
      (repo: GitHubRepository.GitHubRepository) => (error: GitHubClientError) =>
        new GitHubLabelValidationError({
          reason: "Unavailable",
          repository: repo.slug,
          retryable: error.retryable,
          message: `GitHub label data for ${repo.slug} is unavailable. ${error.message}`,
        })
    const labels = Effect.fn("LabelingRules.labels")(function* (
      repo: GitHubRepository.GitHubRepository,
    ) {
      return yield* github
        .listRepositoryLabels(repo)
        .pipe(Stream.runCollect, Effect.mapError(mapGitHubError(repo)))
    })
    const validateLabel = Effect.fn("LabelingRules.validateLabel")(function* (
      repo: GitHubRepository.GitHubRepository,
      label: GitHubLabel.GitHubLabelName,
    ) {
      const direct = yield* github
        .getRepositoryLabel(repo, label)
        .pipe(Effect.mapError(mapGitHubError(repo)))
      if (Option.isSome(direct))
        return { exists: true, label: direct.value } as const
      const canonical = (yield* labels(repo)).find(
        (item) => item.name.toLowerCase() === label.toLowerCase(),
      )
      return canonical === undefined
        ? ({ exists: false } as const)
        : ({ exists: true, label: canonical } as const)
    })
    const requireLabel = Effect.fn("LabelingRules.requireLabel")(function* (
      repo: GitHubRepository.GitHubRepository,
      label: GitHubLabel.GitHubLabelName,
    ) {
      const checked = yield* validateLabel(repo, label)
      if (checked.exists) return checked.label
      return yield* new GitHubLabelValidationError({
        reason: "MissingLabel",
        repository: repo.slug,
        label,
        retryable: false,
        message: `The label '${label}' does not exist in ${repo.slug}.`,
      })
    })
    const stored = Effect.fn("LabelingRules.stored")(function* (
      result: LabelingRuleCommandResult,
    ) {
      if (result._tag === "Deleted")
        return yield* Effect.die("Expected stored rule")
      return result.rule
    })
    const list = Effect.fn("LabelingRules.list")(function* (
      slug: Slug,
      options: ListRulesOptions,
    ) {
      const repo = yield* repository(slug)
      const configured = yield* rules.listByRepository(repo.id, options)
      const now = yield* DateTime.now
      const fires = yield* stats.listRecentFires(
        repo.id,
        DateTime.toEpochMillis(now) - 30 * 86_400_000,
      )
      return {
        repositoryId: repo.id,
        repository: repo.slug,
        revision: repo.rulesRevision,
        rules: configured,
        activity: {
          windowDays: 30 as const,
          totalFires: fires.reduce((sum, row) => sum + row.fires, 0),
          rules: fires,
        },
      }
    })
    const get = Effect.fn("LabelingRules.get")(function* (
      slug: Slug,
      id: Rule.LabelingRule["id"],
    ) {
      return yield* requireRule(yield* repository(slug), id)
    })
    const page = <
      A extends {
        readonly id: Audit.LabelingRuleAuditEntry["id"]
        readonly createdAt: DateTime.Utc
      },
    >(
      rows: ReadonlyArray<A>,
      limit: number,
    ) => {
      const hasMore = rows.length > limit
      const entries = hasMore ? rows.slice(0, limit) : rows
      const last = entries.at(-1)
      return {
        entries,
        nextCursor:
          hasMore && last !== undefined
            ? { createdAt: DateTime.toEpochMillis(last.createdAt), id: last.id }
            : null,
      }
    }
    const listAudit = Effect.fn("LabelingRules.listAudit")(function* (
      slug: Slug,
      options: ListRuleAuditOptions,
    ) {
      const repo = yield* repository(slug)
      return page(
        yield* audit.listByRepository(repo.id, {
          ...options,
          limit: options.limit + 1,
        }),
        options.limit,
      )
    })
    const listActivity = Effect.fn("LabelingRules.listActivity")(function* (
      options: ListRuleActivityOptions,
    ) {
      return page(
        yield* audit.listActivity({ ...options, limit: options.limit + 1 }),
        options.limit,
      )
    })
    const create = Effect.fn("LabelingRules.create")(function* (
      slug: Slug,
      input: Management.CreateLabelingRuleRequest,
      identity: AdminIdentity,
    ) {
      const repo = yield* repository(slug)
      if (input._tag === "PolicyLabelingRule")
        yield* requirePolicy(repo, input.policyId, input.enabled)
      else if (input.gatePolicyId !== null)
        yield* requirePolicy(repo, input.gatePolicyId, true)
      const canonical = yield* requireLabel(repo, input.label)
      const now = yield* DateTime.now
      const shared = {
        repositoryId: repo.id,
        label: canonical.name,
        onMatch: input.onMatch,
        onNoMatch: input.onNoMatch,
        conflictGroup: input.conflictGroup ?? null,
        priority: input.priority ?? 0,
        enabled: input.enabled,
        validationStatus: "valid" as const,
        validatedAt: now,
        version: 1,
      }
      const ruleInput =
        input._tag === "PolicyLabelingRule"
          ? Rule.PolicyLabelingRule.insert.make({
              ...shared,
              _tag: input._tag,
              policyId: input.policyId,
            })
          : Rule.AiLabelingRule.insert.make({
              ...shared,
              _tag: input._tag,
              prompt: input.prompt,
              evidence: input.evidence,
              minimumConfidence: input.minimumConfidence,
              evaluator: input.evaluator,
              gatePolicyId: input.gatePolicyId,
            })
      return yield* execute(
        {
          _tag: "Create",
          repositoryId: repo.id,
          repository: repo.slug,
          expectedRevision: repo.rulesRevision,
          input: ruleInput,
        },
        actor(identity),
      ).pipe(Effect.flatMap(stored))
    })
    const update = Effect.fn("LabelingRules.update")(function* (
      slug: Slug,
      id: Rule.LabelingRule["id"],
      input: Management.PatchLabelingRuleRequest,
      identity: AdminIdentity,
    ) {
      const repo = yield* repository(slug)
      const current = yield* requireRule(repo, id)
      if (current.version !== input.version)
        return yield* new LabelingRuleConflict({
          repository: repo.slug,
          ruleId: id,
          currentRule: current,
        })
      if (input._tag !== current._tag)
        return yield* new InvalidLabelingRule({
          message: "A labeling rule cannot be converted to another rule kind.",
        })
      const enabled = input.enabled ?? current.enabled
      if (
        current._tag === "PolicyLabelingRule" &&
        input._tag === "PolicyLabelingRule"
      )
        yield* requirePolicy(repo, input.policyId ?? current.policyId, enabled)
      else if (
        current._tag === "AiLabelingRule" &&
        input._tag === "AiLabelingRule"
      ) {
        const gatePolicyId =
          input.gatePolicyId === undefined
            ? current.gatePolicyId
            : input.gatePolicyId
        if (gatePolicyId !== null)
          yield* requirePolicy(repo, gatePolicyId, true)
      }
      const now = yield* DateTime.now
      const requiresValidation =
        input.label !== undefined ||
        (input.enabled === true && !current.enabled) ||
        current.validationStatus !== "valid" ||
        current.validatedAt === null ||
        DateTime.toEpochMillis(now) -
          DateTime.toEpochMillis(current.validatedAt) >=
          Duration.toMillis(validationTtl)
      const canonical = requiresValidation
        ? yield* requireLabel(repo, input.label ?? current.label)
        : undefined
      const { version: _version, ...changes } = input
      return yield* execute(
        {
          _tag: "Update",
          repositoryId: repo.id,
          repository: repo.slug,
          ruleId: id,
          expectedVersion: input.version,
          expectedRevision: repo.rulesRevision,
          input: {
            ...changes,
            ...(canonical === undefined
              ? {}
              : {
                  label: canonical.name,
                  validationStatus: "valid" as const,
                  validatedAt: now,
                }),
          },
        },
        actor(identity),
      ).pipe(Effect.flatMap(stored))
    })
    const revalidate = Effect.fn("LabelingRules.revalidate")(function* (
      slug: Slug,
      id: Rule.LabelingRule["id"],
      identity: AdminIdentity,
    ) {
      const repo = yield* repository(slug)
      const current = yield* requireRule(repo, id)
      const checked = yield* validateLabel(repo, current.label)
      const now = yield* DateTime.now
      return yield* execute(
        {
          _tag: checked.exists ? "Validate" : "MarkMissing",
          repositoryId: repo.id,
          repository: repo.slug,
          ruleId: id,
          expectedVersion: current.version,
          expectedRevision: repo.rulesRevision,
          input: checked.exists
            ? {
                _tag: current._tag,
                label: checked.label.name,
                validationStatus: "valid",
                validatedAt: now,
              }
            : {
                _tag: current._tag,
                enabled: false,
                validationStatus: "missing",
                validatedAt: now,
              },
        },
        actor(identity),
      ).pipe(Effect.flatMap(stored))
    })
    const disable = Effect.fn("LabelingRules.disable")(function* (
      slug: Slug,
      id: Rule.LabelingRule["id"],
      version: number,
      identity: AdminIdentity,
    ) {
      const repo = yield* repository(slug)
      return yield* execute(
        {
          _tag: "Disable",
          repositoryId: repo.id,
          repository: repo.slug,
          ruleId: id,
          expectedVersion: version,
          expectedRevision: repo.rulesRevision,
          input: { _tag: (yield* requireRule(repo, id))._tag, enabled: false },
        },
        actor(identity),
      ).pipe(Effect.flatMap(stored))
    })
    const remove = Effect.fn("LabelingRules.remove")(function* (
      slug: Slug,
      id: Rule.LabelingRule["id"],
      version: number,
      identity: AdminIdentity,
    ) {
      const repo = yield* repository(slug)
      const result = yield* execute(
        {
          _tag: "Delete",
          repositoryId: repo.id,
          repository: repo.slug,
          ruleId: id,
          expectedVersion: version,
          expectedRevision: repo.rulesRevision,
        },
        actor(identity),
      )
      if (result._tag !== "Deleted")
        return yield* Effect.die("Expected deleted rule")
    })
    const getActiveSnapshot = Effect.fn("LabelingRules.getActiveSnapshot")(
      function* (repositoryId: GitHubRepository.GitHubRepository["id"]) {
        const found = yield* repositories.findById(repositoryId)
        if (Option.isNone(found) || !found.value.enabled)
          return yield* new RepositoryNotConfigured({
            repository: repositoryId,
          })
        return {
          repositoryId,
          repository: found.value.slug,
          revision: found.value.rulesRevision,
          rules: (yield* rules.listByRepository(repositoryId, {
            includeDisabled: false,
          })).filter((rule) => rule.validationStatus === "valid"),
        }
      },
    )
    const assertRevision = Effect.fn("LabelingRules.assertRevision")(function* (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      expected: number,
    ) {
      const actual = yield* repositories.getRulesRevision(repositoryId)
      if (actual !== expected) {
        const found = yield* repositories.findById(repositoryId)
        return yield* new StaleLabelingRulesRevision({
          repository: Option.isSome(found) ? found.value.slug : repositoryId,
          expectedRevision: expected,
          actualRevision: actual,
          currentRule: null,
        })
      }
    })
    const markMissing = Effect.fn("LabelingRules.markMissing")(function* (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      id: Rule.LabelingRule["id"],
      version: number,
    ) {
      const found = yield* repositories.findById(repositoryId)
      if (Option.isNone(found))
        return yield* new LabelingRuleNotFound({
          repository: repositoryId,
          ruleId: id,
        })
      const now = yield* DateTime.now
      yield* execute(
        {
          _tag: "MarkMissing",
          repositoryId,
          repository: found.value.slug,
          ruleId: id,
          expectedVersion: version,
          expectedRevision: found.value.rulesRevision,
          input: {
            _tag: (yield* requireRule(found.value, id))._tag,
            enabled: false,
            validationStatus: "missing",
            validatedAt: now,
          },
        },
        { _tag: "System", actor: "runtime-missing-label" },
      )
    })
    const revalidateStaleBatch = Effect.fn(
      "LabelingRules.revalidateStaleBatch",
    )(function* (options: {
      readonly validatedBefore: DateTime.Utc
      readonly limit: number
    }) {
      const stale = yield* rules.listStaleEnabled(
        options.validatedBefore,
        options.limit,
      )
      const outcomes = yield* Effect.forEach(
        stale,
        (rule) =>
          Effect.gen(function* () {
            const repo = yield* repositories.findById(rule.repositoryId)
            if (Option.isNone(repo) || !repo.value.enabled)
              return "failed" as const
            const checked = yield* validateLabel(repo.value, rule.label)
            const now = yield* DateTime.now
            yield* execute(
              {
                _tag: checked.exists ? "Validate" : "MarkMissing",
                repositoryId: rule.repositoryId,
                repository: repo.value.slug,
                ruleId: rule.id,
                expectedVersion: rule.version,
                expectedRevision: repo.value.rulesRevision,
                input: checked.exists
                  ? {
                      _tag: rule._tag,
                      label: checked.label.name,
                      validationStatus: "valid",
                      validatedAt: now,
                    }
                  : {
                      _tag: rule._tag,
                      enabled: false,
                      validationStatus: "missing",
                      validatedAt: now,
                    },
              },
              { _tag: "System", actor: "scheduled-validation" },
            )
            return checked.exists ? ("valid" as const) : ("missing" as const)
          }).pipe(Effect.catch(() => Effect.succeed("failed" as const))),
        { concurrency: 1 },
      )
      return {
        processed: outcomes.length,
        valid: outcomes.filter((item) => item === "valid").length,
        missing: outcomes.filter((item) => item === "missing").length,
        failed: outcomes.filter((item) => item === "failed").length,
      }
    })
    return {
      list,
      get,
      listAudit,
      listActivity,
      create,
      update,
      revalidate,
      disable,
      remove,
      getActiveSnapshot,
      assertRevision,
      listAvailableLabels: (slug: Slug) =>
        repository(slug).pipe(Effect.flatMap(labels)),
      validateCandidateLabel: (
        slug: Slug,
        label: GitHubLabel.GitHubLabelName,
      ) =>
        repository(slug).pipe(
          Effect.flatMap((repo) => validateLabel(repo, label)),
        ),
      markMissing,
      revalidateStaleBatch,
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([
      GitHubRepositoriesRepo.layer,
      GitHubClient.layer,
      LabelingRulesRepo.layer,
      LabelingRuleAuditLogRepo.layer,
      LabelingRuleStatsRepo.layer,
      PoliciesRepo.layer,
    ]),
  )
}
