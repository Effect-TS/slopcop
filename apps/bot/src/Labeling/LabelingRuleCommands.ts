import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import type * as SqlError from "effect/unstable/sql/SqlError"
import {
  GitHubRepositoriesRepo,
  type GitHubRepositoriesRepoError,
} from "../GitHub/repositories/GitHubRepositoriesRepo.ts"
import {
  DuplicateLabelingRule,
  InvalidLabelingRule,
  LabelingRuleConflict,
  LabelingRuleNotFound,
  StaleLabelingRulesRevision,
} from "./LabelingRuleErrors.ts"
import {
  LabelingRuleAuditLogRepo,
  type LabelingRuleAuditLogRepoError,
} from "./repositories/LabelingRuleAuditLogRepo.ts"
import {
  LabelingRulesRepo,
  type LabelingRulesRepoError,
} from "./repositories/LabelingRulesRepo.ts"

export type ConfigurationActor =
  | { readonly _tag: "Administrator"; readonly actor: string }
  | {
      readonly _tag: "System"
      readonly actor: "scheduled-validation" | "runtime-missing-label"
    }

type ExistingMutation = {
  readonly repositoryId: GitHubRepository.GitHubRepository["id"]
  readonly repository: string
  readonly ruleId: LabelingRule.LabelingRule["id"]
  readonly expectedVersion: number
  readonly expectedRevision: number
}

export interface LabelingRuleChanges {
  readonly label?: string
  readonly kind?: "ai" | "ready-for-review"
  readonly instructions?: string
  readonly mode?: "add-only" | "reconcile"
  readonly exclusiveGroup?: string | null
  readonly enabled?: boolean
  readonly validationStatus?: "valid" | "missing" | "unknown"
  readonly validatedAt?: LabelingRule.LabelingRule["validatedAt"]
}

export type LabelingRuleCommand =
  | {
      readonly _tag: "Create"
      readonly repositoryId: GitHubRepository.GitHubRepository["id"]
      readonly repository: string
      readonly expectedRevision: number
      readonly input: typeof LabelingRule.LabelingRule.insert.Type
    }
  | (ExistingMutation & {
      readonly _tag: "Update" | "Validate" | "Disable" | "MarkMissing"
      readonly input: LabelingRuleChanges
    })
  | (ExistingMutation & { readonly _tag: "Delete" })

export type LabelingRuleCommandResult =
  | { readonly _tag: "Stored"; readonly rule: LabelingRule.LabelingRule }
  | { readonly _tag: "Deleted" }

export type LabelingRuleCommandError =
  | GitHubRepositoriesRepoError
  | LabelingRulesRepoError
  | LabelingRuleAuditLogRepoError
  | SqlError.SqlError
  | DuplicateLabelingRule
  | InvalidLabelingRule
  | LabelingRuleConflict
  | LabelingRuleNotFound
  | StaleLabelingRulesRevision

const actorName = (actor: ConfigurationActor) =>
  actor._tag === "Administrator"
    ? `admin:${actor.actor}`
    : `system:${actor.actor}`

const auditValue = (
  rule: LabelingRule.LabelingRule,
): LabelingRuleAuditEntry.LabelingRuleAuditValue => ({
  id: rule.id,
  repositoryId: rule.repositoryId,
  label: rule.label,
  kind: rule.kind,
  instructions: rule.instructions,
  mode: rule.mode,
  exclusiveGroup: rule.exclusiveGroup,
  enabled: rule.enabled,
  validationStatus: rule.validationStatus,
  validatedAt: rule.validatedAt,
  version: rule.version,
})

const operation = (
  command: LabelingRuleCommand,
): "create" | "update" | "validate" | "disable" | "delete" => {
  switch (command._tag) {
    case "Create":
      return "create"
    case "Update":
      return "update"
    case "Validate":
    case "MarkMissing":
      return "validate"
    case "Disable":
      return "disable"
    case "Delete":
      return "delete"
  }
}

const storedMutation = (
  rule: LabelingRule.LabelingRule,
): LabelingRuleCommandResult => ({
  _tag: "Stored",
  rule,
})

const deletedMutation = (): LabelingRuleCommandResult => ({ _tag: "Deleted" })

export const makeLabelingRuleCommands = Effect.gen(function* () {
  const repositories = yield* GitHubRepositoriesRepo
  const rules = yield* LabelingRulesRepo
  const audit = yield* LabelingRuleAuditLogRepo
  const sql = yield* SqlClient.SqlClient

  const validateRuleSet = Effect.fn("LabelingRuleCommands.validateRuleSet")(
    function* (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      repository: string,
      candidate: {
        readonly label: string
        readonly kind: "ai" | "ready-for-review"
        readonly mode: "add-only" | "reconcile"
        readonly exclusiveGroup: string | null
        readonly enabled: boolean
        readonly validationStatus: "valid" | "missing" | "unknown"
      },
      excludedRuleId?: LabelingRule.LabelingRule["id"],
    ) {
      const existing = yield* rules.listByRepository(repositoryId, {
        includeDisabled: true,
      })
      const others = existing.filter((rule) => rule.id !== excludedRuleId)
      const duplicate = others.find(
        (rule) => rule.label.toLowerCase() === candidate.label.toLowerCase(),
      )
      if (duplicate !== undefined) {
        return yield* new DuplicateLabelingRule({
          repository,
          label: candidate.label,
        })
      }
      if (
        candidate.enabled &&
        others.filter((rule) => rule.enabled).length >= 50
      ) {
        return yield* new InvalidLabelingRule({
          message: "A repository may have at most 50 enabled labeling rules.",
        })
      }
      if (candidate.enabled && candidate.validationStatus !== "valid") {
        return yield* new InvalidLabelingRule({
          message: "An enabled labeling rule must have a valid GitHub label.",
        })
      }
      if (
        candidate.kind === "ready-for-review" &&
        candidate.mode !== "reconcile"
      ) {
        return yield* new InvalidLabelingRule({
          message: "Ready-for-review rules must use reconcile mode.",
        })
      }
      if (candidate.exclusiveGroup !== null) {
        const incompatible = others.find(
          (rule) =>
            rule.exclusiveGroup === candidate.exclusiveGroup &&
            rule.mode !== candidate.mode,
        )
        if (incompatible !== undefined) {
          return yield* new InvalidLabelingRule({
            message: `Rules in exclusive group '${candidate.exclusiveGroup}' must use the same mode.`,
          })
        }
      }
    },
  )

  const execute = Effect.fn("LabelingRuleCommands.execute")(function* (
    command: LabelingRuleCommand,
    actor: ConfigurationActor,
  ) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const actualRevision = yield* repositories.getRulesRevision(
          command.repositoryId,
        )
        if (actualRevision !== command.expectedRevision) {
          return yield* new StaleLabelingRulesRevision({
            repositoryId: command.repositoryId,
            expectedRevision: command.expectedRevision,
            actualRevision,
          })
        }

        if (command._tag === "Create") {
          yield* validateRuleSet(
            command.repositoryId,
            command.repository,
            command.input,
          )
          const stored = yield* rules.insert(command.input)
          yield* repositories.incrementRulesRevision(
            command.repositoryId,
            command.expectedRevision,
          )
          yield* audit.append(
            LabelingRuleAuditEntry.LabelingRuleAuditEntry.insert.make({
              repositoryId: command.repositoryId,
              ruleId: stored.id,
              actor: actorName(actor),
              operation: "create",
              before: null,
              after: auditValue(stored),
            }),
          )
          return storedMutation(stored)
        }

        const found = yield* rules.findById(
          command.repositoryId,
          command.ruleId,
        )
        if (Option.isNone(found)) {
          return yield* new LabelingRuleNotFound({
            repository: command.repository,
            ruleId: command.ruleId,
          })
        }
        const before = found.value
        if (before.version !== command.expectedVersion) {
          return yield* new LabelingRuleConflict({
            repository: command.repository,
            ruleId: command.ruleId,
            currentRule: before,
          })
        }

        if (command._tag === "Delete") {
          if (before.enabled) {
            return yield* new InvalidLabelingRule({
              message: "Disable the labeling rule before deleting it.",
            })
          }
          yield* rules.remove(
            command.repositoryId,
            command.ruleId,
            command.expectedVersion,
          )
          yield* repositories.incrementRulesRevision(
            command.repositoryId,
            command.expectedRevision,
          )
          yield* audit.append(
            LabelingRuleAuditEntry.LabelingRuleAuditEntry.insert.make({
              repositoryId: command.repositoryId,
              ruleId: null,
              actor: actorName(actor),
              operation: "delete",
              before: auditValue(before),
              after: null,
            }),
          )
          return deletedMutation()
        }

        const candidate = {
          label: command.input.label ?? before.label,
          kind: command.input.kind ?? before.kind,
          mode: command.input.mode ?? before.mode,
          exclusiveGroup:
            command.input.exclusiveGroup === undefined
              ? before.exclusiveGroup
              : command.input.exclusiveGroup,
          enabled: command.input.enabled ?? before.enabled,
          validationStatus:
            command.input.validationStatus ?? before.validationStatus,
        }
        yield* validateRuleSet(
          command.repositoryId,
          command.repository,
          candidate,
          command.ruleId,
        )
        const update = LabelingRule.LabelingRule.update.make({
          id: before.id,
          repositoryId: before.repositoryId,
          label: candidate.label,
          kind: candidate.kind,
          instructions: command.input.instructions ?? before.instructions,
          mode: candidate.mode,
          exclusiveGroup: candidate.exclusiveGroup,
          enabled: candidate.enabled,
          validationStatus: candidate.validationStatus,
          validatedAt:
            command.input.validatedAt === undefined
              ? before.validatedAt
              : command.input.validatedAt,
          version: before.version,
        })
        const stored = yield* rules.update(
          command.ruleId,
          command.expectedVersion,
          update,
        )
        yield* repositories.incrementRulesRevision(
          command.repositoryId,
          command.expectedRevision,
        )
        yield* audit.append(
          LabelingRuleAuditEntry.LabelingRuleAuditEntry.insert.make({
            repositoryId: command.repositoryId,
            ruleId: command.ruleId,
            actor: actorName(actor),
            operation: operation(command),
            before: auditValue(before),
            after: auditValue(stored),
          }),
        )
        return storedMutation(stored)
      }),
    )
  })

  return execute
})
