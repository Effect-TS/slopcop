import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import * as Audit from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import {
  DuplicateLabelingRule,
  InvalidLabelingRule,
  LabelingRuleConflict,
  LabelingRuleNotFound,
  StaleLabelingRulesRevision,
} from "./LabelingRuleErrors.ts"
import { LabelingRuleAuditLogRepo } from "./repositories/LabelingRuleAuditLogRepo.ts"
import { LabelingRulesRepo } from "./repositories/LabelingRulesRepo.ts"

export type ConfigurationActor =
  | { readonly _tag: "Administrator"; readonly actor: string }
  | {
      readonly _tag: "System"
      readonly actor: "scheduled-validation" | "runtime-missing-label"
    }
type ExistingMutation = {
  readonly repositoryId: GitHubRepository.GitHubRepository["id"]
  readonly repository: string
  readonly ruleId: Rule.LabelingRule["id"]
  readonly expectedVersion: number
  readonly expectedRevision: number
}
export interface LabelingRuleChanges {
  readonly policyId?: Rule.LabelingRule["policyId"]
  readonly label?: Rule.LabelingRule["label"]
  readonly onNoMatch?: Rule.LabelingRule["onNoMatch"]
  readonly conflictGroup?: Rule.LabelingRule["conflictGroup"]
  readonly priority?: number
  readonly enabled?: boolean
  readonly validationStatus?: Rule.LabelingRule["validationStatus"]
  readonly validatedAt?: Rule.LabelingRule["validatedAt"]
}
export type LabelingRuleCommand =
  | {
      readonly _tag: "Create"
      readonly repositoryId: GitHubRepository.GitHubRepository["id"]
      readonly repository: string
      readonly expectedRevision: number
      readonly input: typeof Rule.LabelingRule.insert.Type
    }
  | (ExistingMutation & {
      readonly _tag: "Update" | "Validate" | "Disable" | "MarkMissing"
      readonly input: LabelingRuleChanges
    })
  | (ExistingMutation & { readonly _tag: "Delete" })
export type LabelingRuleCommandResult =
  | { readonly _tag: "Stored"; readonly rule: Rule.LabelingRule }
  | { readonly _tag: "Deleted" }

const actorName = (actor: ConfigurationActor) =>
  actor._tag === "Administrator"
    ? `admin:${actor.actor}`
    : `system:${actor.actor}`
const auditValue = (rule: Rule.LabelingRule): Audit.LabelingRuleAuditValue => ({
  id: rule.id,
  repositoryId: rule.repositoryId,
  policyId: rule.policyId,
  label: rule.label,
  onMatch: rule.onMatch,
  onNoMatch: rule.onNoMatch,
  conflictGroup: rule.conflictGroup,
  priority: rule.priority,
  enabled: rule.enabled,
  validationStatus: rule.validationStatus,
  validatedAt: rule.validatedAt,
  version: rule.version,
})
const operation = (
  command: LabelingRuleCommand,
): Audit.LabelingRuleAuditEntry["operation"] => {
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

export const validateLabelingRuleSet = (
  existing: ReadonlyArray<Rule.LabelingRule>,
  repository: string,
  candidate: Pick<
    Rule.LabelingRule,
    "label" | "onNoMatch" | "conflictGroup" | "enabled" | "validationStatus"
  >,
  excludedRuleId?: Rule.LabelingRule["id"],
): Effect.Effect<void, DuplicateLabelingRule | InvalidLabelingRule> => {
  const others = existing.filter((rule) => rule.id !== excludedRuleId)
  if (
    others.some(
      (rule) => rule.label.toLowerCase() === candidate.label.toLowerCase(),
    )
  )
    return Effect.fail(
      new DuplicateLabelingRule({ repository, label: candidate.label }),
    )
  if (candidate.enabled && others.filter((rule) => rule.enabled).length >= 50)
    return Effect.fail(
      new InvalidLabelingRule({
        message: "A repository may have at most 50 enabled labeling rules.",
      }),
    )
  if (candidate.enabled && candidate.validationStatus !== "valid")
    return Effect.fail(
      new InvalidLabelingRule({
        message: "An enabled labeling rule must have a valid GitHub label.",
      }),
    )
  if (
    candidate.conflictGroup !== null &&
    others.some(
      (rule) =>
        rule.conflictGroup === candidate.conflictGroup &&
        rule.onNoMatch !== candidate.onNoMatch,
    )
  )
    return Effect.fail(
      new InvalidLabelingRule({
        message: `Rules in conflict group '${candidate.conflictGroup}' must use the same no-match action.`,
      }),
    )
  return Effect.void
}
export const validateLabelingRuleDeletion = (rule: Rule.LabelingRule) =>
  rule.enabled
    ? Effect.fail(
        new InvalidLabelingRule({
          message: "Disable the labeling rule before deleting it.",
        }),
      )
    : Effect.void

export const makeLabelingRuleCommands = Effect.gen(function* () {
  const repositories = yield* GitHubRepositoriesRepo
  const rules = yield* LabelingRulesRepo
  const audit = yield* LabelingRuleAuditLogRepo
  const validateSet = Effect.fn("LabelingRuleCommands.validateSet")(function* (
    repositoryId: GitHubRepository.GitHubRepository["id"],
    repository: string,
    candidate: Pick<
      Rule.LabelingRule,
      "label" | "onNoMatch" | "conflictGroup" | "enabled" | "validationStatus"
    >,
    excludedRuleId?: Rule.LabelingRule["id"],
  ) {
    yield* validateLabelingRuleSet(
      yield* rules.listByRepository(repositoryId, { includeDisabled: true }),
      repository,
      candidate,
      excludedRuleId,
    )
  })
  return Effect.fn("LabelingRuleCommands.execute")(function* (
    command: LabelingRuleCommand,
    actor: ConfigurationActor,
  ) {
    const actualRevision = yield* repositories.getRulesRevision(
      command.repositoryId,
    )
    if (actualRevision !== command.expectedRevision) {
      const current =
        command._tag === "Create"
          ? Option.none<Rule.LabelingRule>()
          : yield* rules.findById(command.repositoryId, command.ruleId)
      return yield* new StaleLabelingRulesRevision({
        repository: command.repository,
        expectedRevision: command.expectedRevision,
        actualRevision,
        currentRule: Option.getOrNull(current),
      })
    }
    if (command._tag === "Create") {
      yield* validateSet(
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
        Audit.LabelingRuleAuditEntry.insert.make({
          repositoryId: command.repositoryId,
          ruleId: stored.id,
          actor: actorName(actor),
          operation: "create",
          before: null,
          after: auditValue(stored),
        }),
      )
      return { _tag: "Stored", rule: stored } as const
    }
    const found = yield* rules.findById(command.repositoryId, command.ruleId)
    if (Option.isNone(found))
      return yield* new LabelingRuleNotFound({
        repository: command.repository,
        ruleId: command.ruleId,
      })
    const before = found.value
    if (before.version !== command.expectedVersion)
      return yield* new LabelingRuleConflict({
        repository: command.repository,
        ruleId: command.ruleId,
        currentRule: before,
      })
    if (command._tag === "Delete") {
      yield* validateLabelingRuleDeletion(before)
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
        Audit.LabelingRuleAuditEntry.insert.make({
          repositoryId: command.repositoryId,
          ruleId: null,
          actor: actorName(actor),
          operation: "delete",
          before: auditValue(before),
          after: null,
        }),
      )
      return { _tag: "Deleted" } as const
    }
    const candidate = {
      label: command.input.label ?? before.label,
      onNoMatch: command.input.onNoMatch ?? before.onNoMatch,
      conflictGroup:
        command.input.conflictGroup === undefined
          ? before.conflictGroup
          : command.input.conflictGroup,
      enabled: command.input.enabled ?? before.enabled,
      validationStatus:
        command.input.validationStatus ?? before.validationStatus,
    }
    yield* validateSet(
      command.repositoryId,
      command.repository,
      candidate,
      command.ruleId,
    )
    const stored = yield* rules.update(
      command.ruleId,
      command.expectedVersion,
      Rule.LabelingRule.update.make({
        id: before.id,
        repositoryId: before.repositoryId,
        policyId: command.input.policyId ?? before.policyId,
        label: candidate.label,
        onMatch: before.onMatch,
        onNoMatch: candidate.onNoMatch,
        conflictGroup: candidate.conflictGroup,
        priority: command.input.priority ?? before.priority,
        enabled: candidate.enabled,
        validationStatus: candidate.validationStatus,
        validatedAt:
          command.input.validatedAt === undefined
            ? before.validatedAt
            : command.input.validatedAt,
        version: before.version,
      }),
    )
    yield* repositories.incrementRulesRevision(
      command.repositoryId,
      command.expectedRevision,
    )
    yield* audit.append(
      Audit.LabelingRuleAuditEntry.insert.make({
        repositoryId: command.repositoryId,
        ruleId: command.ruleId,
        actor: actorName(actor),
        operation: operation(command),
        before: auditValue(before),
        after: auditValue(stored),
      }),
    )
    return { _tag: "Stored", rule: stored } as const
  })
})
