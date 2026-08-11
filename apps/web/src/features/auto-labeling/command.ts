import { ApiClient } from "../../api-client"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as FoldkitCommand from "foldkit/command"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import { PolicyDraft } from "./condition"
import * as M from "./message"
import {
  PolicyId,
  PolicyIdentity,
  Repository,
  RuleDraft,
  RuleId,
  RuleIdentity,
} from "./model"

export type Command = FoldkitCommand.Command<M.Message, never, ApiClient>
const failureMessage = (error: {
  readonly _tag: string
  readonly message?: string
}): string => {
  switch (error._tag) {
    case "RepositoryNotConfigured":
      return "This repository is not configured for SlopCop."
    case "PolicyConflict":
      return "The policy changed on the server. Your local changes are preserved."
    case "LabelingRuleConflict":
    case "LabelingRulesRevisionConflict":
      return "The label rule changed on the server. Your local draft is preserved."
    case "InvalidPolicyProgram":
      return error.message ?? "The policy program is invalid."
    case "UnsupportedTarget":
      return "Only pull request policies are currently supported."
    case "PolicyNotFound":
      return "This policy no longer exists. Refresh the repository."
    case "PolicyTestUnavailable":
      return "Policy testing is unavailable. No labels were changed."
    case "RuleTestCandidatesUnavailable":
      return "Recent pull requests are unavailable."
    case "GitHubLabelNotFound":
      return "The selected GitHub label no longer exists."
    default:
      return (
        error.message ?? "The request failed. Your local input is preserved."
      )
  }
}
const isRuleRevisionConflict = (error: { readonly _tag: string }): boolean =>
  error._tag === "LabelingRulesRevisionConflict"

export const LoadRepositoryData = FoldkitCommand.define("LoadRepositoryData", {
  args: { requestId: Schema.Int, repository: Repository },
  messages: [M.LoadedRepositoryData, M.FailedToLoadRepositoryData],
  execute: ({ repository, requestId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const [policies, rules, audit, labels] = yield* Effect.all([
        client.labelingPolicies.listPolicies({ params: repository }),
        client.labelingRules.listRules({
          params: repository,
          query: { includeDisabled: true },
        }),
        client.labelingRules.listRuleAudit({
          params: repository,
          query: { limit: 20 },
        }),
        client.labelingRules.listGitHubLabels({ params: repository }),
      ])
      return M.LoadedRepositoryData({
        requestId,
        repository,
        policyRevision: policies.revision,
        ruleRevision: rules.revision,
        policies: policies.policies,
        rules: rules.rules,
        activity: rules.activity,
        audit: audit.entries,
        labels: labels.labels,
      })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedToLoadRepositoryData({
            requestId,
            repository,
            message: failureMessage(error),
          }),
        ),
      ),
    ),
})

export const LoadPolicyDetail = FoldkitCommand.define("LoadPolicyDetail", {
  args: { requestId: Schema.Int, repository: Repository, policyId: PolicyId },
  messages: [M.LoadedPolicyDetail, M.FailedToLoadPolicyDetail],
  execute: ({ requestId, repository, policyId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const detail = yield* client.labelingPolicies.getPolicy({
        params: { ...repository, policyId },
      })
      return M.LoadedPolicyDetail({ requestId, repository, detail })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedToLoadPolicyDetail({
            requestId,
            repository,
            policyId,
            message: failureMessage(error),
          }),
        ),
      ),
    ),
})

export const SavePolicy = FoldkitCommand.define("SavePolicy", {
  args: {
    requestId: Schema.Int,
    repository: Repository,
    identity: PolicyIdentity,
    draft: PolicyDraft,
    program: PolicyProgram.PolicyProgram,
  },
  messages: [M.CompletedSavePolicy, M.FailedToSavePolicy],
  execute: ({ requestId, repository, identity, draft, program }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const policy =
        identity._tag === "NewPolicy"
          ? yield* client.labelingPolicies.createPolicy({
              params: repository,
              payload: {
                name: draft.name,
                target: draft.target,
                program,
                metadata:
                  draft.description.trim() === ""
                    ? {}
                    : { description: draft.description },
              },
            })
          : yield* client.labelingPolicies.savePolicy({
              params: { ...repository, policyId: identity.id },
              payload: {
                name: draft.name,
                program,
                metadata:
                  draft.description.trim() === ""
                    ? {}
                    : { description: draft.description },
                version: identity.version,
              },
            })
      return M.CompletedSavePolicy({ requestId, repository, policy })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedToSavePolicy({
            requestId,
            repository,
            message: failureMessage(error),
            currentPolicy:
              error._tag === "PolicyConflict" ? error.currentPolicy : null,
            currentVersion:
              error._tag === "PolicyConflict" ? error.currentVersion : null,
          }),
        ),
      ),
    ),
})

export const ValidatePolicy = FoldkitCommand.define("ValidatePolicy", {
  args: { requestId: Schema.Int, repository: Repository, policyId: PolicyId },
  messages: [M.CompletedValidatePolicy, M.FailedToValidatePolicy],
  execute: ({ requestId, repository, policyId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const result = yield* client.labelingPolicies.validatePolicy({
        params: { ...repository, policyId },
      })
      return M.CompletedValidatePolicy({
        requestId,
        repository,
        policyId,
        result,
      })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedToValidatePolicy({
            requestId,
            repository,
            policyId,
            message: failureMessage(error),
          }),
        ),
      ),
    ),
})

export const DeletePolicy = FoldkitCommand.define("DeletePolicy", {
  args: {
    requestId: Schema.Int,
    repository: Repository,
    policyId: PolicyId,
    version: Schema.Int,
  },
  messages: [M.CompletedDeletePolicy, M.FailedToDeletePolicy],
  execute: ({ requestId, repository, policyId, version }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      yield* client.labelingPolicies.deletePolicy({
        params: { ...repository, policyId },
        query: { version },
      })
      return M.CompletedDeletePolicy({ requestId, repository, policyId })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedToDeletePolicy({
            requestId,
            repository,
            message: failureMessage(error),
            currentPolicy:
              error._tag === "PolicyConflict" ? error.currentPolicy : null,
          }),
        ),
      ),
    ),
})

export const SaveRule = FoldkitCommand.define("SaveRule", {
  args: {
    requestId: Schema.Int,
    repository: Repository,
    identity: RuleIdentity,
    draft: RuleDraft,
  },
  messages: [M.CompletedSaveRule, M.FailedToSaveRule],
  execute: ({ requestId, repository, identity, draft }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const shared = {
        label: draft.label,
        onNoMatch: draft.onNoMatch,
        conflictGroup:
          draft.conflictGroup.trim() === "" ? null : draft.conflictGroup,
        priority: draft.priority,
        enabled: draft.enabled,
      }
      const rule =
        identity._tag === "NewRule"
          ? draft._tag === "PolicyLabelingRule"
            ? yield* client.labelingRules.createRule({
                params: repository,
                payload: {
                  _tag: draft._tag,
                  ...shared,
                  onMatch: "ensure-present",
                  policyId: draft.policyId,
                },
              })
            : yield* client.labelingRules.createRule({
                params: repository,
                payload: {
                  _tag: draft._tag,
                  ...shared,
                  onMatch: "ensure-present",
                  prompt: draft.promptEditor.source,
                  evidence: draft.evidence,
                  minimumConfidence: draft.minimumConfidence,
                  evaluator: draft.evaluator,
                  gatePolicyId: draft.gatePolicyId,
                },
              })
          : draft._tag === "PolicyLabelingRule"
            ? yield* client.labelingRules.patchRule({
                params: { ...repository, ruleId: identity.id },
                payload: {
                  _tag: draft._tag,
                  ...shared,
                  policyId: draft.policyId,
                  version: identity.version,
                },
              })
            : yield* client.labelingRules.patchRule({
                params: { ...repository, ruleId: identity.id },
                payload: {
                  _tag: draft._tag,
                  ...shared,
                  prompt: draft.promptEditor.source,
                  evidence: draft.evidence,
                  minimumConfidence: draft.minimumConfidence,
                  evaluator: draft.evaluator,
                  gatePolicyId: draft.gatePolicyId,
                  version: identity.version,
                },
              })
      return M.CompletedSaveRule({ requestId, repository, rule })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedToSaveRule({
            requestId,
            repository,
            message: failureMessage(error),
            currentRule:
              error._tag === "LabelingRuleConflict" ||
              error._tag === "LabelingRulesRevisionConflict"
                ? error.currentRule
                : null,
            revisionConflict: isRuleRevisionConflict(error),
          }),
        ),
      ),
    ),
})

export const ToggleRule = FoldkitCommand.define("ToggleRule", {
  args: {
    requestId: Schema.Int,
    repository: Repository,
    ruleId: RuleId,
    version: Schema.Int,
    enabled: Schema.Boolean,
    ruleType: Schema.Literals(["PolicyLabelingRule", "AiLabelingRule"]),
  },
  messages: [M.CompletedToggleRule, M.FailedToToggleRule],
  execute: ({ requestId, repository, ruleId, version, enabled, ruleType }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const rule =
        ruleType === "PolicyLabelingRule"
          ? yield* client.labelingRules.patchRule({
              params: { ...repository, ruleId },
              payload: { _tag: ruleType, version, enabled },
            })
          : yield* client.labelingRules.patchRule({
              params: { ...repository, ruleId },
              payload: { _tag: ruleType, version, enabled },
            })
      return M.CompletedToggleRule({ requestId, repository, rule })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedToToggleRule({
            requestId,
            repository,
            ruleId,
            message: failureMessage(error),
            currentRule:
              error._tag === "LabelingRuleConflict" ||
              error._tag === "LabelingRulesRevisionConflict"
                ? error.currentRule
                : null,
            revisionConflict: isRuleRevisionConflict(error),
          }),
        ),
      ),
    ),
})

export const DeleteRule = FoldkitCommand.define("DeleteRule", {
  args: {
    requestId: Schema.Int,
    repository: Repository,
    ruleId: RuleId,
    version: Schema.Int,
  },
  messages: [M.CompletedDeleteRule, M.FailedToDeleteRule],
  execute: ({ requestId, repository, ruleId, version }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      yield* client.labelingRules.deleteRule({
        params: { ...repository, ruleId },
        query: { version },
      })
      return M.CompletedDeleteRule({ requestId, repository, ruleId })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedToDeleteRule({
            requestId,
            repository,
            message: failureMessage(error),
            currentRule:
              error._tag === "LabelingRuleConflict" ||
              error._tag === "LabelingRulesRevisionConflict"
                ? error.currentRule
                : null,
            revisionConflict: isRuleRevisionConflict(error),
          }),
        ),
      ),
    ),
})

export const LoadPolicyTestCandidates = FoldkitCommand.define(
  "LoadPolicyTestCandidates",
  {
    args: { requestId: Schema.Int, repository: Repository, policyId: PolicyId },
    messages: [
      M.LoadedPolicyTestCandidates,
      M.FailedToLoadPolicyTestCandidates,
    ],
    execute: ({ requestId, repository, policyId }) =>
      Effect.gen(function* () {
        const client = yield* ApiClient
        const result = yield* client.labelingRules.listRuleTestCandidates({
          params: repository,
          query: { limit: 50 },
        })
        return M.LoadedPolicyTestCandidates({
          requestId,
          repository,
          policyId,
          candidates: result.candidates,
        })
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            M.FailedToLoadPolicyTestCandidates({
              requestId,
              repository,
              policyId,
              message: failureMessage(error),
            }),
          ),
        ),
      ),
  },
)

export const LoadRuleTestCandidates = FoldkitCommand.define(
  "LoadRuleTestCandidates",
  {
    args: {
      requestId: Schema.Int,
      repository: Repository,
      ruleId: RuleId,
    },
    messages: [M.LoadedRuleTestCandidates, M.FailedToLoadRuleTestCandidates],
    execute: ({ requestId, repository, ruleId }) =>
      Effect.gen(function* () {
        const client = yield* ApiClient
        const result = yield* client.labelingRules.listRuleTestCandidates({
          params: repository,
          query: { limit: 50 },
        })
        return M.LoadedRuleTestCandidates({
          requestId,
          repository,
          ruleId,
          candidates: result.candidates,
        })
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            M.FailedToLoadRuleTestCandidates({
              requestId,
              repository,
              ruleId,
              message: failureMessage(error),
            }),
          ),
        ),
      ),
  },
)

export const TestRule = FoldkitCommand.define("TestRule", {
  args: {
    requestId: Schema.Int,
    repository: Repository,
    ruleId: RuleId,
    pullRequestNumber: Schema.Int,
  },
  messages: [M.CompletedRuleTest, M.FailedRuleTest],
  execute: ({ requestId, repository, ruleId, pullRequestNumber }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const result = yield* client.labelingRules.testRule({
        params: { ...repository, ruleId },
        payload: { pullRequestNumber },
      })
      return M.CompletedRuleTest({ requestId, repository, result })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedRuleTest({
            requestId,
            repository,
            message: failureMessage(error),
          }),
        ),
      ),
    ),
})

export const TestPolicy = FoldkitCommand.define("TestPolicy", {
  args: {
    requestId: Schema.Int,
    repository: Repository,
    policyId: PolicyId,
    pullRequestNumber: Schema.Int,
  },
  messages: [M.CompletedPolicyTest, M.FailedPolicyTest],
  execute: ({ requestId, repository, policyId, pullRequestNumber }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const result = yield* client.labelingPolicies.testPolicy({
        params: { ...repository, policyId },
        payload: { pullRequestNumber },
      })
      return M.CompletedPolicyTest({ requestId, repository, result })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          M.FailedPolicyTest({
            requestId,
            repository,
            message: failureMessage(error),
          }),
        ),
      ),
    ),
})
