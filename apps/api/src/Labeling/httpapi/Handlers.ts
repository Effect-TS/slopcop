import { RootApi } from "@slopcop/api/RootApi"
import * as ApiError from "@slopcop/api/LabelingRules/Errors"
import { LabelingAdminIdentity } from "@slopcop/api/LabelingRules/Security"
import * as Management from "@slopcop/domain/Labeling/LabelingRuleManagement"
import type * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import type * as Rule from "@slopcop/domain/Labeling/LabelingRule"
import type * as Audit from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import { GitHubClientError } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { GitHubRepositoryLabelsRepo } from "@slopcop/github/repositories/GitHubRepositoryLabelsRepo"
import {
  LabelingRules,
  type LabelingRulesError,
} from "@slopcop/labeling/LabelingRules"
import { Policies } from "@slopcop/labeling/Policies"
import type { PoliciesError } from "@slopcop/labeling/Policies"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import { LabelingRuleTestCandidates } from "../LabelingRuleTestCandidates.ts"
import {
  LabelingRuleTester,
  type LabelingRuleTestError,
} from "../LabelingRuleTester.ts"
import { LabelingAdminMiddlewareLayer } from "./Security.ts"

const decodeRule = Schema.decodeEffect(
  Schema.toType(Management.PublicLabelingRule),
)
export const toPublicRule = (
  rule: Rule.LabelingRule,
  policy: Policy.LabelingPolicy | null,
) => {
  const shared = {
    _tag: rule._tag,
    id: rule.id,
    label: rule.label,
    onMatch: rule.onMatch,
    onNoMatch: rule.onNoMatch,
    conflictGroup: rule.conflictGroup,
    priority: rule.priority,
    enabled: rule.enabled,
    validationStatus: rule.validationStatus,
    validatedAt: rule.validatedAt,
    version: rule.version,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }
  if (rule._tag === "PolicyLabelingRule") {
    if (policy === null)
      return Effect.die(
        `Rule '${rule.id}' references missing policy '${rule.policyId}'.`,
      )
    return decodeRule({
      ...shared,
      _tag: rule._tag,
      policyId: rule.policyId,
      policy: {
        id: policy.id,
        name: policy.name,
      },
    }).pipe(Effect.orDie)
  }
  return decodeRule({
    ...shared,
    _tag: rule._tag,
    prompt: rule.prompt,
    evidence: rule.evidence,
    minimumConfidence: rule.minimumConfidence,
    evaluator: rule.evaluator,
    gatePolicyId: rule.gatePolicyId,
    gatePolicy:
      policy === null
        ? null
        : {
            id: policy.id,
            name: policy.name,
          },
  }).pipe(Effect.orDie)
}
const decodeAudit = Schema.decodeEffect(
  Schema.toType(Management.PublicLabelingRuleAuditEntry),
)
const auditValue = (value: Audit.StoredLabelingRuleAuditValue | null) => {
  if (value === null) return null
  const { repositoryId: _repositoryId, ...publicValue } = value
  return publicValue
}
export const toPublicAuditEntry = (entry: Audit.LabelingRuleAuditEntry) => {
  const ruleId = entry.after?.id ?? entry.before?.id
  if (ruleId === undefined)
    return Effect.die(`Audit entry '${entry.id}' has no rule snapshot.`)
  return decodeAudit({
    id: entry.id,
    ruleId,
    actor: entry.actor,
    operation: entry.operation,
    before: auditValue(entry.before),
    after: auditValue(entry.after),
    createdAt: entry.createdAt,
  }).pipe(Effect.orDie)
}
export const parseAuditCursor = (
  cursor: typeof Management.LabelingRuleAuditCursor.Type | undefined,
) => {
  if (cursor === undefined) return Effect.succeed(null)
  const separator = cursor.indexOf(":")
  return Schema.decodeUnknownEffect(
    Schema.Struct({
      createdAt: Schema.NumberFromString,
      id: Schema.String.pipe(Schema.brand("LabelingRuleAuditEntryId")),
    }),
  )({
    createdAt: cursor.slice(0, separator),
    id: cursor.slice(separator + 1),
  }).pipe(Effect.orDie)
}
export const formatAuditCursor = (
  cursor: { readonly createdAt: number; readonly id: string } | null,
) =>
  cursor === null
    ? Effect.succeed(null)
    : Schema.decodeUnknownEffect(Management.LabelingRuleAuditCursor)(
        `${cursor.createdAt}:${cursor.id}`,
      ).pipe(Effect.orDie)

interface PolicyReader {
  readonly list: (slug: {
    readonly owner: string
    readonly repo: string
  }) => Effect.Effect<
    {
      readonly repository: string
      readonly revision: number
      readonly policies: ReadonlyArray<Policy.LabelingPolicy>
    },
    PoliciesError
  >
}
const policyFor = Effect.fn("Handlers.policyFor")(function* (
  policies: PolicyReader,
  slug: { readonly owner: string; readonly repo: string },
  rule: Rule.LabelingRule,
) {
  const policyId =
    rule._tag === "PolicyLabelingRule" ? rule.policyId : rule.gatePolicyId
  if (policyId === null) return null
  const configured = yield* policies.list(slug).pipe(Effect.orDie)
  const policy = configured.policies.find(
    (candidate) => candidate.id === policyId,
  )
  if (policy === undefined)
    return yield* Effect.die(
      `Rule '${rule.id}' references missing policy '${policyId}'.`,
    )
  return policy
})
type PublicError =
  | ApiError.RepositoryNotConfigured
  | ApiError.LabelingRuleNotFound
  | ApiError.GitHubLabelNotFound
  | ApiError.InvalidLabelingRule
  | ApiError.DuplicateLabelingRule
  | ApiError.LabelingRuleConflict
  | ApiError.LabelingRulesRevisionConflict
  | ApiError.GitHubLabelValidationUnavailable
  | ApiError.PullRequestNotFound
  | ApiError.LabelingRuleTestUnavailable
export const mapRuleError = (
  error: LabelingRulesError,
  encodeCurrent: (
    rule: Rule.LabelingRule,
  ) => Effect.Effect<Management.PublicLabelingRule>,
): Effect.Effect<never, PublicError> => {
  switch (error._tag) {
    case "RepositoryNotConfigured":
      return Effect.fail(
        new ApiError.RepositoryNotConfigured({
          repository: error.repository,
          message: `${error.repository} is not configured.`,
        }),
      )
    case "LabelingRuleNotFound":
      return Effect.fail(
        new ApiError.LabelingRuleNotFound({
          repository: error.repository,
          ruleId: error.ruleId,
          message: `Labeling rule '${error.ruleId}' does not exist.`,
        }),
      )
    case "GitHubLabelValidationError":
      return error.reason === "MissingLabel" && error.label !== undefined
        ? Effect.fail(
            new ApiError.GitHubLabelNotFound({
              repository: error.repository,
              label: error.label,
              message: error.message,
            }),
          )
        : Effect.fail(
            new ApiError.GitHubLabelValidationUnavailable({
              repository: error.repository,
              message: error.message,
            }),
          )
    case "DuplicateLabelingRule":
      return Effect.fail(
        new ApiError.DuplicateLabelingRule({
          repository: error.repository,
          label: error.label,
          message: `${error.repository} already has a binding for '${error.label}'.`,
        }),
      )
    case "InvalidLabelingRule":
      return Effect.fail(
        new ApiError.InvalidLabelingRule({ message: error.message }),
      )
    case "LabelingRuleConflict":
      return encodeCurrent(error.currentRule).pipe(
        Effect.flatMap((currentRule) =>
          Effect.fail(
            new ApiError.LabelingRuleConflict({
              repository: error.repository,
              ruleId: error.ruleId,
              currentRule,
              message: `Rule '${error.ruleId}' changed. Refresh and retry.`,
            }),
          ),
        ),
      )
    case "StaleLabelingRulesRevision":
      return Effect.gen(function* () {
        const currentRule =
          error.currentRule === null
            ? null
            : yield* encodeCurrent(error.currentRule)
        return yield* new ApiError.LabelingRulesRevisionConflict({
          repository: error.repository,
          expectedRevision: error.expectedRevision,
          actualRevision: error.actualRevision,
          currentRule,
          message:
            "Repository labeling configuration changed. Refresh and retry.",
        })
      })
    default:
      return Effect.logError("Labeling rule operation failed", error).pipe(
        Effect.andThen(Effect.die(error)),
      )
  }
}
const mapTestError = (
  error: LabelingRuleTestError,
): Effect.Effect<
  never,
  ApiError.PullRequestNotFound | ApiError.LabelingRuleTestUnavailable
> => {
  const response = error.notFound
    ? new ApiError.PullRequestNotFound({
        repository: error.repository,
        pullRequestNumber: error.pullRequestNumber,
        message: `Pull request #${error.pullRequestNumber} does not exist or is inaccessible.`,
      })
    : new ApiError.LabelingRuleTestUnavailable({
        repository: error.repository,
        ruleId: error.ruleId,
        pullRequestNumber: error.pullRequestNumber,
        retryable: error.retryable,
        message: "The rule test failed. No labels or evaluations were written.",
      })
  return Effect.logError("Labeling rule test failed", error.cause).pipe(
    Effect.annotateLogs({
      repository: error.repository,
      ruleId: error.ruleId,
      pullRequestNumber: error.pullRequestNumber,
      retryable: error.retryable,
      notFound: error.notFound,
    }),
    Effect.andThen(Effect.fail(response)),
  )
}
const mapRepository = (error: RepositoryNotConfigured) =>
  Effect.fail(
    new ApiError.RepositoryNotConfigured({
      repository: error.repository,
      message: `${error.repository} is not configured.`,
    }),
  )
const mapCandidates = (repository: string, error: GitHubClientError) =>
  Effect.fail(
    new ApiError.RuleTestCandidatesUnavailable({
      repository,
      retryable: error.retryable,
      message: `Recent pull requests for ${repository} are unavailable.`,
    }),
  )

export const LabelingRulesApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "labelingRules",
  Effect.fnUntraced(function* (handlers) {
    const rules = yield* LabelingRules
    const repositories = yield* GitHubRepositoriesRepo
    const cachedLabels = yield* GitHubRepositoryLabelsRepo
    const policies = yield* Policies
    const tester = yield* LabelingRuleTester
    const candidates = yield* LabelingRuleTestCandidates
    const encode = (
      slug: { readonly owner: string; readonly repo: string },
      rule: Rule.LabelingRule,
    ) =>
      policyFor(policies, slug, rule).pipe(
        Effect.flatMap((policy) => toPublicRule(rule, policy)),
      )
    const catchRule =
      (slug: { readonly owner: string; readonly repo: string }) =>
      (error: LabelingRulesError) =>
        mapRuleError(error, (rule) => encode(slug, rule))
    return handlers.handleAll({
      listRules: Effect.fnUntraced(function* ({ params, query }) {
        const result = yield* rules
          .list(params, { includeDisabled: query.includeDisabled ?? false })
          .pipe(Effect.catch(catchRule(params)))
        return {
          repository: result.repository,
          revision: result.revision,
          rules: yield* Effect.forEach(result.rules, (rule) =>
            encode(params, rule),
          ),
          activity: result.activity,
        }
      }),
      listRuleAudit: Effect.fnUntraced(function* ({ params, query }) {
        const result = yield* rules
          .listAudit(params, {
            ruleId: query.ruleId ?? null,
            operation: query.operation ?? null,
            cursor: yield* parseAuditCursor(query.cursor),
            limit: query.limit ?? 50,
          })
          .pipe(Effect.catch(catchRule(params)))
        return {
          entries: yield* Effect.forEach(result.entries, toPublicAuditEntry),
          nextCursor: yield* formatAuditCursor(result.nextCursor),
        }
      }),
      getRule: ({ params }) =>
        rules.get(params, params.ruleId).pipe(
          Effect.catch(catchRule(params)),
          Effect.flatMap((rule) => encode(params, rule)),
        ),
      listGitHubLabels: ({ params }) =>
        Effect.gen(function* () {
          const found = yield* repositories
            .findBySlug(params)
            .pipe(
              Effect.catchTag("GitHubRepositoriesRepoError", (error) =>
                Effect.logError("GitHub repository lookup failed", error).pipe(
                  Effect.andThen(Effect.die(error)),
                ),
              ),
            )
          const repository = yield* Option.match(found, {
            onNone: () =>
              Effect.fail(
                new RepositoryNotConfigured({
                  repository: `${params.owner}/${params.repo}`,
                }),
              ),
            onSome: Effect.succeed,
          })
          const labels = yield* cachedLabels
            .list(repository.id)
            .pipe(
              Effect.catchTag("GitHubRepositoryLabelsRepoError", (error) =>
                Effect.logError(
                  "Cached GitHub label lookup failed",
                  error,
                ).pipe(Effect.andThen(Effect.die(error))),
              ),
            )
          return { labels }
        }).pipe(Effect.catchTag("RepositoryNotConfigured", mapRepository)),
      listRuleTestCandidates: ({ params, query }) =>
        candidates.list(params, query.limit ?? 50).pipe(
          Effect.map((candidates) => ({ candidates })),
          Effect.catchTag("RepositoryNotConfigured", mapRepository),
          Effect.catchTag("GitHubClientError", (error) =>
            mapCandidates(`${params.owner}/${params.repo}`, error),
          ),
        ),
      validateCandidateLabel: ({ params, payload }) =>
        rules
          .validateCandidateLabel(params, payload.label)
          .pipe(Effect.catch(catchRule(params))),
      createRule: ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          const rule = yield* rules
            .create(params, payload, identity)
            .pipe(Effect.catch(catchRule(params)))
          return yield* encode(params, rule)
        }),
      patchRule: ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          const rule = yield* rules
            .update(params, params.ruleId, payload, identity)
            .pipe(Effect.catch(catchRule(params)))
          return yield* encode(params, rule)
        }),
      validateStoredRule: ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          const rule = yield* rules
            .revalidate(params, params.ruleId, identity)
            .pipe(Effect.catch(catchRule(params)))
          return yield* encode(params, rule)
        }),
      testRule: ({ params, payload }) =>
        tester
          .test(params, params.ruleId, payload.pullRequestNumber)
          .pipe(
            Effect.catch((error) =>
              error._tag === "LabelingRuleTestError"
                ? mapTestError(error)
                : catchRule(params)(error),
            ),
          ),
      disableRule: ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          const rule = yield* rules
            .disable(params, params.ruleId, payload.version, identity)
            .pipe(Effect.catch(catchRule(params)))
          return yield* encode(params, rule)
        }),
      deleteRule: ({ params, query }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          yield* rules
            .remove(params, params.ruleId, query.version, identity)
            .pipe(Effect.catch(catchRule(params)))
        }),
    })
  }),
).pipe(Layer.provide(LabelingAdminMiddlewareLayer))
