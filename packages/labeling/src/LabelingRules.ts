import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Context from "effect/Context"
import * as Config from "effect/Config"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { GitHubClient, GitHubClientError } from "@slopcop/github/GitHubClient"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import type { GitHubRepositoriesRepoError } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"

type RepositoryName = GitHubRepository.GitHubRepositorySlug
import {
  GitHubLabelValidationError,
  LabelingRuleConflict,
  LabelingRuleNotFound,
  StaleLabelingRulesRevision,
} from "./LabelingRuleErrors.ts"
import {
  type ConfigurationActor,
  type LabelingRuleCommandError,
  makeLabelingRuleCommands,
} from "./LabelingRuleCommands.ts"
import {
  LabelingRulesRepo,
  type LabelingRulesRepoError,
  type ListRulesOptions,
} from "./repositories/LabelingRulesRepo.ts"
import {
  LabelingRuleAuditLogRepo,
  type LabelingRuleAuditLogRepoError,
  type LabelingRuleAuditActivityRow,
} from "./repositories/LabelingRuleAuditLogRepo.ts"

export interface AdminIdentity {
  readonly actor: string
}

export interface LabelingRuleSet {
  readonly repositoryId: GitHubRepository.GitHubRepository["id"]
  readonly repository: string
  readonly revision: number
  readonly rules: ReadonlyArray<LabelingRule.LabelingRule>
}

export type CreateLabelingRule =
  LabelingRuleManagement.CreateLabelingRuleRequest

export type UpdateLabelingRule = LabelingRuleManagement.PatchLabelingRuleRequest

export interface RuleValidationBatchResult {
  readonly processed: number
  readonly valid: number
  readonly missing: number
  readonly failed: number
}

export interface LabelingRuleAuditPage {
  readonly entries: ReadonlyArray<LabelingRuleAuditEntry.LabelingRuleAuditEntry>
  readonly nextCursor: {
    readonly createdAt: number
    readonly id: LabelingRuleAuditEntry.LabelingRuleAuditEntry["id"]
  } | null
}

export interface LabelingRuleActivityPage {
  readonly entries: ReadonlyArray<LabelingRuleAuditActivityRow>
  readonly nextCursor: LabelingRuleAuditPage["nextCursor"]
}

type LabelingRulesReadError =
  | RepositoryNotConfigured
  | GitHubRepositoriesRepoError
  | LabelingRulesRepoError
  | LabelingRuleAuditLogRepoError
  | LabelingRuleNotFound

export type LabelingRulesError =
  | LabelingRulesReadError
  | GitHubLabelValidationError
  | LabelingRuleCommandError
  | StaleLabelingRulesRevision

const asActor = (identity: AdminIdentity): ConfigurationActor => ({
  _tag: "Administrator",
  actor: identity.actor,
})

export class LabelingRules extends Context.Service<
  LabelingRules,
  {
    readonly list: (
      repository: RepositoryName,
      options: ListRulesOptions,
    ) => Effect.Effect<LabelingRuleSet, LabelingRulesReadError>
    readonly get: (
      repository: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
    ) => Effect.Effect<LabelingRule.LabelingRule, LabelingRulesReadError>
    readonly listAudit: (
      repository: RepositoryName,
      options: {
        readonly ruleId: LabelingRule.LabelingRule["id"] | null
        readonly operation:
          | LabelingRuleAuditEntry.LabelingRuleAuditEntry["operation"]
          | null
        readonly cursor: {
          readonly createdAt: number
          readonly id: LabelingRuleAuditEntry.LabelingRuleAuditEntry["id"]
        } | null
        readonly limit: number
      },
    ) => Effect.Effect<LabelingRuleAuditPage, LabelingRulesReadError>
    readonly listActivity: (options: {
      readonly repository: string | null
      readonly operation:
        | LabelingRuleAuditEntry.LabelingRuleAuditEntry["operation"]
        | null
      readonly cursor: LabelingRuleAuditPage["nextCursor"]
      readonly limit: number
    }) => Effect.Effect<LabelingRuleActivityPage, LabelingRulesReadError>
    readonly create: (
      repository: RepositoryName,
      input: CreateLabelingRule,
      actor: AdminIdentity,
    ) => Effect.Effect<LabelingRule.LabelingRule, LabelingRulesError>
    readonly update: (
      repository: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
      input: UpdateLabelingRule,
      actor: AdminIdentity,
    ) => Effect.Effect<LabelingRule.LabelingRule, LabelingRulesError>
    readonly revalidate: (
      repository: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
      actor: AdminIdentity,
    ) => Effect.Effect<LabelingRule.LabelingRule, LabelingRulesError>
    readonly disable: (
      repository: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
      version: number,
      actor: AdminIdentity,
    ) => Effect.Effect<LabelingRule.LabelingRule, LabelingRulesError>
    readonly remove: (
      repository: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
      version: number,
      actor: AdminIdentity,
    ) => Effect.Effect<void, LabelingRulesError>
    readonly getActiveSnapshot: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
    ) => Effect.Effect<LabelingRuleSet, LabelingRulesError>
    readonly assertRevision: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      expectedRevision: number,
    ) => Effect.Effect<void, LabelingRulesError>
    readonly listAvailableLabels: (
      repository: RepositoryName,
    ) => Effect.Effect<
      ReadonlyArray<GitHubLabel.GitHubLabel>,
      LabelingRulesError
    >
    readonly validateCandidateLabel: (
      repository: RepositoryName,
      label: GitHubLabel.GitHubLabelName,
    ) => Effect.Effect<
      GitHubLabel.GitHubLabelValidationResult,
      LabelingRulesError
    >
    readonly markMissing: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      ruleId: LabelingRule.LabelingRule["id"],
      expectedVersion: number,
    ) => Effect.Effect<void, LabelingRulesError>
    readonly revalidateStaleBatch: (options: {
      readonly validatedBefore: DateTime.Utc
      readonly limit: number
    }) => Effect.Effect<RuleValidationBatchResult, LabelingRulesError>
  }
>()("@slopcop/labeling/LabelingRules", {
  make: Effect.gen(function* () {
    const repositoryRows = yield* GitHubRepositoriesRepo
    const rules = yield* LabelingRulesRepo
    const auditLog = yield* LabelingRuleAuditLogRepo
    const github = yield* GitHubClient
    const executeCommand = yield* makeLabelingRuleCommands
    const validationTtl = yield* Config.duration(
      "LABELING_RULE_VALIDATION_TTL",
    ).pipe(Config.withDefault(Duration.hours(24)))

    const getConfiguredRepository = Effect.fn(
      "LabelingRules.getConfiguredRepository",
    )(function* (slug: GitHubRepository.GitHubRepositorySlug) {
      const result = yield* repositoryRows.findBySlug(slug)
      if (Option.isNone(result)) {
        return yield* new RepositoryNotConfigured({
          repository: `${slug.owner}/${slug.repo}`,
        })
      }
      return result.value
    })

    const mapGitHubLabelError =
      (repository: GitHubRepository.GitHubRepository) =>
      (error: GitHubClientError) =>
        new GitHubLabelValidationError({
          reason: "Unavailable",
          repository: repository.slug,
          retryable: error.retryable,
          message: `GitHub label data for ${repository.slug} is unavailable. ${error.message}`,
        })

    const listLabels = Effect.fn("LabelingRules.listLabels")(
      function* (repository: GitHubRepository.GitHubRepository) {
        return yield* github
          .listRepositoryLabels(repository)
          .pipe(Stream.runCollect)
      },
      (effect, repository) =>
        Effect.mapError(effect, mapGitHubLabelError(repository)),
    )

    const validateLabel = Effect.fn("LabelingRules.validateLabel")(function* (
      repository: GitHubRepository.GitHubRepository,
      label: GitHubLabel.GitHubLabelName,
    ) {
      const result = yield* github
        .getRepositoryLabel(repository, label)
        .pipe(Effect.mapError(mapGitHubLabelError(repository)))
      if (Option.isSome(result)) {
        return { exists: true, label: result.value } as const
      }

      // GitHub also uses 404 for inaccessible repositories. A successful
      // label listing confirms access before absence is considered final.
      const labels = yield* listLabels(repository)
      const canonical = labels.find(
        (candidate) => candidate.name.toLowerCase() === label.toLowerCase(),
      )
      return canonical === undefined
        ? ({ exists: false } as const)
        : ({ exists: true, label: canonical } as const)
    })

    const requireLabel = Effect.fn("LabelingRules.requireLabel")(function* (
      repository: GitHubRepository.GitHubRepository,
      label: GitHubLabel.GitHubLabelName,
    ) {
      const result = yield* validateLabel(repository, label)
      if (result.exists) return result.label
      return yield* new GitHubLabelValidationError({
        reason: "MissingLabel",
        repository: repository.slug,
        label,
        retryable: false,
        message: `The label '${label}' does not exist in ${repository.slug}. Select an existing GitHub label or create it in GitHub before retrying.`,
      })
    })

    const requireRule = Effect.fn("LabelingRules.requireRule")(function* (
      repository: GitHubRepository.GitHubRepository,
      ruleId: LabelingRule.LabelingRule["id"],
    ) {
      const found = yield* rules.findById(repository.id, ruleId)
      if (Option.isNone(found)) {
        return yield* new LabelingRuleNotFound({
          repository: repository.slug,
          ruleId,
        })
      }
      return found.value
    })

    const storedResult = Effect.fn("LabelingRules.storedResult")(function* (
      effect: ReturnType<typeof executeCommand>,
    ) {
      const result = yield* effect
      if (result._tag === "Deleted") return yield* Effect.die("Expected rule")
      return result.rule
    })

    const list = Effect.fn("LabelingRules.list")(function* (
      name: RepositoryName,
      options: ListRulesOptions,
    ) {
      const repository = yield* getConfiguredRepository(name)
      const configuredRules = yield* rules.listByRepository(
        repository.id,
        options,
      )
      return {
        repositoryId: repository.id,
        repository: repository.slug,
        revision: repository.rulesRevision,
        rules: configuredRules,
      }
    })

    const get = Effect.fn("LabelingRules.get")(function* (
      name: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
    ) {
      const repository = yield* getConfiguredRepository(name)
      return yield* requireRule(repository, ruleId)
    })

    const listAudit = Effect.fn("LabelingRules.listAudit")(function* (
      name: RepositoryName,
      options: {
        readonly ruleId: LabelingRule.LabelingRule["id"] | null
        readonly operation:
          | LabelingRuleAuditEntry.LabelingRuleAuditEntry["operation"]
          | null
        readonly cursor: {
          readonly createdAt: number
          readonly id: LabelingRuleAuditEntry.LabelingRuleAuditEntry["id"]
        } | null
        readonly limit: number
      },
    ) {
      const repository = yield* getConfiguredRepository(name)
      const rows = yield* auditLog.listByRepository(repository.id, {
        ...options,
        limit: options.limit + 1,
      })
      const hasMore = rows.length > options.limit
      const entries = hasMore ? rows.slice(0, options.limit) : rows
      const lastEntry = entries.at(-1)
      return {
        entries,
        nextCursor:
          hasMore && lastEntry !== undefined
            ? {
                createdAt: DateTime.toEpochMillis(lastEntry.createdAt),
                id: lastEntry.id,
              }
            : null,
      }
    })

    const listActivity = Effect.fn("LabelingRules.listActivity")(
      function* (options: {
        readonly repository: string | null
        readonly operation:
          | LabelingRuleAuditEntry.LabelingRuleAuditEntry["operation"]
          | null
        readonly cursor: LabelingRuleAuditPage["nextCursor"]
        readonly limit: number
      }) {
        const rows = yield* auditLog.listActivity({
          ...options,
          limit: options.limit + 1,
        })
        const hasMore = rows.length > options.limit
        const entries = hasMore ? rows.slice(0, options.limit) : rows
        const lastEntry = entries.at(-1)
        return {
          entries,
          nextCursor:
            hasMore && lastEntry !== undefined
              ? {
                  createdAt: DateTime.toEpochMillis(lastEntry.createdAt),
                  id: lastEntry.id,
                }
              : null,
        }
      },
    )

    const create = Effect.fn("LabelingRules.create")(function* (
      name: RepositoryName,
      input: CreateLabelingRule,
      actor: AdminIdentity,
    ) {
      const repository = yield* getConfiguredRepository(name)
      const label = yield* requireLabel(repository, input.label)
      const now = yield* DateTime.now
      const latest = yield* getConfiguredRepository(name)
      return yield* storedResult(
        executeCommand(
          {
            _tag: "Create",
            repositoryId: repository.id,
            repository: repository.slug,
            expectedRevision: latest.rulesRevision,
            input: LabelingRule.LabelingRule.insert.make({
              repositoryId: repository.id,
              name: label.name,
              label: label.name,
              kind: input.kind ?? "ai",
              instructions: input.instructions,
              confidenceThreshold: 0.75,
              mode: input.mode,
              exclusiveGroup: input.exclusiveGroup,
              enabled: input.enabled,
              validationStatus: "valid",
              validatedAt: now,
              version: 1,
            }),
          },
          asActor(actor),
        ),
      )
    })

    const update = Effect.fn("LabelingRules.update")(function* (
      name: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
      input: UpdateLabelingRule,
      actor: AdminIdentity,
    ) {
      const repository = yield* getConfiguredRepository(name)
      const current = yield* requireRule(repository, ruleId)
      if (current.version !== input.version) {
        return yield* new LabelingRuleConflict({
          repository: repository.slug,
          ruleId,
          currentRule: current,
        })
      }
      const now = yield* DateTime.now
      const requiresValidation =
        (input.label !== undefined && input.label !== current.label) ||
        (input.enabled === true && !current.enabled) ||
        current.validationStatus !== "valid" ||
        current.validatedAt === null ||
        DateTime.toEpochMillis(now) -
          DateTime.toEpochMillis(current.validatedAt) >=
          Duration.toMillis(validationTtl)
      const canonical = requiresValidation
        ? yield* requireLabel(repository, input.label ?? current.label)
        : undefined
      const latest = yield* getConfiguredRepository(name)
      const { version: _version, ...changes } = input
      return yield* storedResult(
        executeCommand(
          {
            _tag: "Update",
            repositoryId: repository.id,
            repository: repository.slug,
            ruleId,
            expectedVersion: input.version,
            expectedRevision: latest.rulesRevision,
            input: {
              ...changes,
              ...(canonical === undefined
                ? {}
                : {
                    label: canonical.name,
                    validationStatus: "valid",
                    validatedAt: now,
                  }),
            },
          },
          asActor(actor),
        ),
      )
    })

    const revalidate = Effect.fn("LabelingRules.revalidate")(function* (
      name: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
      actor: AdminIdentity,
    ) {
      const repository = yield* getConfiguredRepository(name)
      const current = yield* requireRule(repository, ruleId)
      const validation = yield* validateLabel(repository, current.label)
      const now = yield* DateTime.now
      const latest = yield* getConfiguredRepository(name)
      return yield* storedResult(
        executeCommand(
          {
            _tag: "Validate",
            repositoryId: repository.id,
            repository: repository.slug,
            ruleId,
            expectedVersion: current.version,
            expectedRevision: latest.rulesRevision,
            input: validation.exists
              ? {
                  label: validation.label.name,
                  validationStatus: "valid",
                  validatedAt: now,
                }
              : {
                  enabled: false,
                  validationStatus: "missing",
                  validatedAt: now,
                },
          },
          asActor(actor),
        ),
      )
    })

    const disable = Effect.fn("LabelingRules.disable")(function* (
      name: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
      version: number,
      actor: AdminIdentity,
    ) {
      const repository = yield* getConfiguredRepository(name)
      const latest = yield* getConfiguredRepository(name)
      return yield* storedResult(
        executeCommand(
          {
            _tag: "Disable",
            repositoryId: repository.id,
            repository: repository.slug,
            ruleId,
            expectedVersion: version,
            expectedRevision: latest.rulesRevision,
            input: { enabled: false },
          },
          asActor(actor),
        ),
      )
    })

    const remove = Effect.fn("LabelingRules.remove")(function* (
      name: RepositoryName,
      ruleId: LabelingRule.LabelingRule["id"],
      version: number,
      actor: AdminIdentity,
    ) {
      const repository = yield* getConfiguredRepository(name)
      const latest = yield* getConfiguredRepository(name)
      const result = yield* executeCommand(
        {
          _tag: "Delete",
          repositoryId: repository.id,
          repository: repository.slug,
          ruleId,
          expectedVersion: version,
          expectedRevision: latest.rulesRevision,
        },
        asActor(actor),
      )
      if (result._tag === "Stored") return yield* Effect.die("Expected delete")
    })

    const getActiveSnapshot = Effect.fn("LabelingRules.getActiveSnapshot")(
      function* (repositoryId: GitHubRepository.GitHubRepository["id"]) {
        const repository = yield* repositoryRows.findById(repositoryId)
        if (Option.isNone(repository) || !repository.value.enabled) {
          return yield* new RepositoryNotConfigured({
            repository: repositoryId,
          })
        }
        const configuredRules = yield* rules.listByRepository(repositoryId, {
          includeDisabled: false,
        })
        return {
          repositoryId,
          repository: repository.value.slug,
          revision: repository.value.rulesRevision,
          rules: configuredRules.filter(
            (rule) => rule.validationStatus === "valid",
          ),
        }
      },
    )

    const assertRevision = Effect.fn("LabelingRules.assertRevision")(function* (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      expectedRevision: number,
    ) {
      const actualRevision =
        yield* repositoryRows.getRulesRevision(repositoryId)
      if (actualRevision !== expectedRevision) {
        return yield* new StaleLabelingRulesRevision({
          repositoryId,
          expectedRevision,
          actualRevision,
        })
      }
    })

    const listAvailableLabels = Effect.fn("LabelingRules.listAvailableLabels")(
      function* (name: RepositoryName) {
        const repository = yield* getConfiguredRepository(name)
        return yield* listLabels(repository)
      },
    )

    const validateCandidateLabel = Effect.fn(
      "LabelingRules.validateCandidateLabel",
    )(function* (name: RepositoryName, label: GitHubLabel.GitHubLabelName) {
      const repository = yield* getConfiguredRepository(name)
      return yield* validateLabel(repository, label)
    })

    const markMissing = Effect.fn("LabelingRules.markMissing")(function* (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      ruleId: LabelingRule.LabelingRule["id"],
      expectedVersion: number,
    ) {
      const repository = yield* repositoryRows.findById(repositoryId)
      if (Option.isNone(repository)) {
        return yield* new LabelingRuleNotFound({
          repository: repositoryId,
          ruleId,
        })
      }
      const now = yield* DateTime.now
      yield* executeCommand(
        {
          _tag: "MarkMissing",
          repositoryId,
          repository: repository.value.slug,
          ruleId,
          expectedVersion,
          expectedRevision: repository.value.rulesRevision,
          input: {
            enabled: false,
            validationStatus: "missing",
            validatedAt: now,
          },
        },
        { _tag: "System", actor: "runtime-missing-label" },
      )
    })

    const revalidateOne = Effect.fn("LabelingRules.revalidateOne")(function* (
      rule: LabelingRule.LabelingRule,
    ) {
      const repository = yield* repositoryRows.findById(rule.repositoryId)
      if (Option.isNone(repository) || !repository.value.enabled)
        return "failed"

      const validation = yield* validateLabel(repository.value, rule.label)
      const latest = yield* repositoryRows.findById(rule.repositoryId)
      if (Option.isNone(latest)) return "failed"
      const now = yield* DateTime.now
      yield* executeCommand(
        {
          _tag: validation.exists ? "Validate" : "MarkMissing",
          repositoryId: rule.repositoryId,
          repository: repository.value.slug,
          ruleId: rule.id,
          expectedVersion: rule.version,
          expectedRevision: latest.value.rulesRevision,
          input: validation.exists
            ? {
                label: validation.label.name,
                validationStatus: "valid",
                validatedAt: now,
              }
            : {
                enabled: false,
                validationStatus: "missing",
                validatedAt: now,
              },
        },
        { _tag: "System", actor: "scheduled-validation" },
      )
      return validation.exists ? "valid" : "missing"
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
          revalidateOne(rule).pipe(
            Effect.catch((cause) =>
              Effect.logWarning("Failed to revalidate stale labeling rule", {
                ruleId: rule.id,
                cause,
              }).pipe(Effect.as("failed")),
            ),
          ),
        { concurrency: 1 },
      )
      return {
        processed: outcomes.length,
        valid: outcomes.filter((outcome) => outcome === "valid").length,
        missing: outcomes.filter((outcome) => outcome === "missing").length,
        failed: outcomes.filter((outcome) => outcome === "failed").length,
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
      listAvailableLabels,
      validateCandidateLabel,
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
    ]),
  )
}
