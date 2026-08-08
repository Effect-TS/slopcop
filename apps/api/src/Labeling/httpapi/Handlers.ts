import { RootApi } from "@slopcop/api/RootApi"
import {
  DuplicateLabelingRule as ApiDuplicateLabelingRule,
  GitHubLabelNotFound,
  GitHubLabelValidationUnavailable,
  InvalidLabelingRule as ApiInvalidLabelingRule,
  LabelingRuleConflict as ApiLabelingRuleConflict,
  LabelingRuleNotFound as ApiLabelingRuleNotFound,
  LabelingRuleTestUnavailable,
  LabelingRulesRevisionConflict,
  RepositoryNotConfigured as ApiRepositoryNotConfigured,
  PullRequestNotFound,
  RuleTestCandidatesUnavailable,
} from "@slopcop/api/LabelingRules/Errors"
import { LabelingAdminIdentity } from "@slopcop/api/LabelingRules/Security"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleAuditEntry from "@slopcop/domain/Labeling/LabelingRuleAuditEntry"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import {
  LabelingRules,
  type LabelingRulesError,
} from "@slopcop/labeling/LabelingRules"
import { LabelingAdminMiddlewareLayer } from "./Security.ts"
import {
  LabelingRuleTester,
  type LabelingRuleTestError,
} from "../LabelingRuleTester.ts"
import { LabelingRuleTestCandidates } from "../LabelingRuleTestCandidates.ts"
import { GitHubClientError } from "@slopcop/github/GitHubClient"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"

const decodeApiRule = Schema.decodeEffect(
  Schema.toType(LabelingRuleManagement.PublicLabelingRule),
)

export const toPublicRule = (rule: LabelingRule.LabelingRule) =>
  decodeApiRule(rule).pipe(Effect.orDie)

const decodePublicAuditEntry = Schema.decodeEffect(
  Schema.toType(LabelingRuleManagement.PublicLabelingRuleAuditEntry),
)

const publicAuditValue = (
  value: LabelingRuleAuditEntry.LabelingRuleAuditValue | null,
) => {
  if (value === null) return null
  const { repositoryId: _repositoryId, ...publicValue } = value
  return publicValue
}

export const toPublicAuditEntry = (
  entry: LabelingRuleAuditEntry.LabelingRuleAuditEntry,
) => {
  const ruleId = entry.after?.id ?? entry.before?.id
  if (ruleId === undefined) {
    return Effect.die(
      `Audit entry '${entry.id}' has neither a before nor an after snapshot.`,
    )
  }
  return decodePublicAuditEntry({
    id: entry.id,
    ruleId,
    actor: entry.actor,
    operation: entry.operation,
    before: publicAuditValue(entry.before),
    after: publicAuditValue(entry.after),
    createdAt: entry.createdAt,
  }).pipe(Effect.orDie)
}

export const parseAuditCursor = (
  cursor:
    | typeof LabelingRuleManagement.LabelingRuleAuditCursor.Type
    | undefined,
) => {
  if (cursor === undefined) return Effect.succeed(null)
  const separator = cursor.indexOf(":")
  return Schema.decodeUnknownEffect(
    Schema.Struct({
      createdAt: Schema.NumberFromString,
      id: LabelingRuleAuditEntry.LabelingRuleAuditEntryId,
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
    : Schema.decodeUnknownEffect(
        LabelingRuleManagement.LabelingRuleAuditCursor,
      )(`${cursor.createdAt}:${cursor.id}`).pipe(Effect.orDie)

const internalFailure = (error: LabelingRulesError) =>
  Effect.logError("Labeling rules operation failed", error).pipe(
    Effect.andThen(Effect.die(error)),
  )

type PublicLabelingRulesError =
  | ApiDuplicateLabelingRule
  | GitHubLabelNotFound
  | GitHubLabelValidationUnavailable
  | ApiInvalidLabelingRule
  | ApiLabelingRuleConflict
  | ApiLabelingRuleNotFound
  | LabelingRulesRevisionConflict
  | ApiRepositoryNotConfigured

export const mapRuleError = (
  error: LabelingRulesError,
): Effect.Effect<never, PublicLabelingRulesError> => {
  switch (error._tag) {
    case "RepositoryNotConfigured":
      return Effect.fail(
        new ApiRepositoryNotConfigured({
          repository: error.repository,
          message: `${error.repository} is not a configured SlopCop repository. Configure it before managing labeling rules.`,
        }),
      )
    case "LabelingRuleNotFound":
      return Effect.fail(
        new ApiLabelingRuleNotFound({
          repository: error.repository,
          ruleId: error.ruleId,
          message: `Labeling rule '${error.ruleId}' does not exist in ${error.repository}.`,
        }),
      )
    case "GitHubLabelValidationError":
      return error.reason === "MissingLabel" && error.label !== undefined
        ? Effect.fail(
            new GitHubLabelNotFound({
              repository: error.repository,
              label: error.label,
              message: `The label '${error.label}' does not exist in ${error.repository}. Select an existing GitHub label or create it in GitHub before retrying. No configuration was changed.`,
            }),
          )
        : Effect.fail(
            new GitHubLabelValidationUnavailable({
              repository: error.repository,
              message: `GitHub label validation for ${error.repository} is unavailable. Retry later. No configuration was changed.`,
            }),
          )
    case "DuplicateLabelingRule":
      return Effect.fail(
        new ApiDuplicateLabelingRule({
          repository: error.repository,
          label: error.label,
          message: `${error.repository} already has a labeling rule for '${error.label}'. Edit the existing rule instead.`,
        }),
      )
    case "InvalidLabelingRule":
      return Effect.fail(new ApiInvalidLabelingRule({ message: error.message }))
    case "LabelingRuleConflict":
      return toPublicRule(error.currentRule).pipe(
        Effect.flatMap((currentRule) =>
          Effect.fail(
            new ApiLabelingRuleConflict({
              repository: error.repository,
              ruleId: error.ruleId,
              currentRule,
              message: `Labeling rule '${error.ruleId}' changed after it was loaded. Refresh it and retry with version ${error.currentRule.version}.`,
            }),
          ),
        ),
      )
    case "StaleLabelingRulesRevision":
      return Effect.flatMap(
        error.currentRule === null
          ? Effect.succeed(null)
          : toPublicRule(error.currentRule),
        (currentRule) =>
          Effect.fail(
            new LabelingRulesRevisionConflict({
              repository: error.repositoryId,
              expectedRevision: error.expectedRevision,
              actualRevision: error.actualRevision,
              currentRule,
              message:
                "The repository labeling configuration changed during this operation. Refresh the rules and retry.",
            }),
          ),
      )
    default:
      return internalFailure(error)
  }
}

const publicRule = (
  effect: Effect.Effect<LabelingRule.LabelingRule, LabelingRulesError>,
) => effect.pipe(Effect.catch(mapRuleError), Effect.flatMap(toPublicRule))

const mapRuleTestError = (
  error: LabelingRuleTestError,
): Effect.Effect<never, PullRequestNotFound | LabelingRuleTestUnavailable> =>
  error.notFound
    ? Effect.fail(
        new PullRequestNotFound({
          repository: error.repository,
          pullRequestNumber: error.pullRequestNumber,
          message: error.message,
        }),
      )
    : Effect.fail(
        new LabelingRuleTestUnavailable({
          repository: error.repository,
          ruleId: error.ruleId,
          pullRequestNumber: error.pullRequestNumber,
          retryable: error.retryable,
          message: error.message,
        }),
      )

const mapRepositoryNotConfigured = (error: RepositoryNotConfigured) =>
  Effect.fail(
    new ApiRepositoryNotConfigured({
      repository: error.repository,
      message: `${error.repository} is not a configured SlopCop repository. Configure it before managing labeling rules.`,
    }),
  )

const mapCandidatesError = (repository: string, error: GitHubClientError) =>
  Effect.fail(
    new RuleTestCandidatesUnavailable({
      repository,
      retryable: error.retryable,
      message: `Recent open pull requests for ${repository} are unavailable. Retry later; no repository data or labels were changed.`,
    }),
  )

export const LabelingRulesApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "labelingRules",
  Effect.fnUntraced(function* (handlers) {
    const rules = yield* LabelingRules
    const tester = yield* LabelingRuleTester
    const testCandidates = yield* LabelingRuleTestCandidates

    return handlers.handleAll({
      listRules: Effect.fnUntraced(function* ({ params, query }) {
        const result = yield* rules
          .list(
            { owner: params.owner, repo: params.repo },
            { includeDisabled: query.includeDisabled ?? false },
          )
          .pipe(Effect.catch(mapRuleError))
        const encoded = yield* Effect.forEach(result.rules, toPublicRule)
        return {
          repository: result.repository,
          revision: result.revision,
          rules: encoded,
          activity: result.activity,
        }
      }),
      listRuleAudit: Effect.fnUntraced(function* ({ params, query }) {
        const cursor = yield* parseAuditCursor(query.cursor)
        const result = yield* rules
          .listAudit(
            { owner: params.owner, repo: params.repo },
            {
              ruleId: query.ruleId ?? null,
              operation: query.operation ?? null,
              cursor,
              limit: query.limit ?? 50,
            },
          )
          .pipe(Effect.catch(mapRuleError))
        return {
          entries: yield* Effect.forEach(result.entries, toPublicAuditEntry),
          nextCursor: yield* formatAuditCursor(result.nextCursor),
        }
      }),
      getRule: ({ params }) =>
        publicRule(
          rules.get({ owner: params.owner, repo: params.repo }, params.ruleId),
        ),
      listGitHubLabels: Effect.fnUntraced(function* ({ params }) {
        const available = yield* rules
          .listAvailableLabels({ owner: params.owner, repo: params.repo })
          .pipe(Effect.catch(mapRuleError))
        return { labels: available }
      }),
      listRuleTestCandidates: ({ params, query }) => {
        const repository = `${params.owner}/${params.repo}`
        return testCandidates
          .list({ owner: params.owner, repo: params.repo }, query.limit ?? 50)
          .pipe(
            Effect.map((candidates) => ({ candidates })),
            Effect.catchTag(
              "RepositoryNotConfigured",
              mapRepositoryNotConfigured,
            ),
            Effect.catchTag("GitHubClientError", (error) =>
              mapCandidatesError(repository, error),
            ),
          )
      },
      validateCandidateLabel: ({ params, payload }) =>
        rules
          .validateCandidateLabel(
            { owner: params.owner, repo: params.repo },
            payload.label,
          )
          .pipe(Effect.catch(mapRuleError)),
      createRule: ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          return yield* publicRule(
            rules.create(
              { owner: params.owner, repo: params.repo },
              payload,
              identity,
            ),
          )
        }),
      patchRule: ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          return yield* publicRule(
            rules.update(
              { owner: params.owner, repo: params.repo },
              params.ruleId,
              payload,
              identity,
            ),
          )
        }),
      validateStoredRule: ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          return yield* publicRule(
            rules.revalidate(
              { owner: params.owner, repo: params.repo },
              params.ruleId,
              identity,
            ),
          )
        }),
      testRule: ({ params, payload }) =>
        tester
          .test(
            { owner: params.owner, repo: params.repo },
            params.ruleId,
            payload.pullRequestNumber,
          )
          .pipe(
            Effect.catchTag("LabelingRuleTestError", mapRuleTestError),
            Effect.catchTag("RepositoryNotConfigured", mapRuleError),
            Effect.catchTag("LabelingRuleNotFound", mapRuleError),
          ),
      disableRule: ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          return yield* publicRule(
            rules.disable(
              { owner: params.owner, repo: params.repo },
              params.ruleId,
              payload.version,
              identity,
            ),
          )
        }),
      deleteRule: ({ params, query }) =>
        Effect.gen(function* () {
          const identity = yield* LabelingAdminIdentity
          yield* rules
            .remove(
              { owner: params.owner, repo: params.repo },
              params.ruleId,
              query.version,
              identity,
            )
            .pipe(Effect.catch(mapRuleError))
        }),
    })
  }),
).pipe(Layer.provide(LabelingAdminMiddlewareLayer))
