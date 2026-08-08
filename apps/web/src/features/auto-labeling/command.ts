import { ApiClient } from "../../api-client"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as FoldkitCommand from "foldkit/command"
import {
  CompletedDeleteRule,
  CompletedRuleTest,
  CompletedSaveRule,
  CompletedToggleRule,
  FailedRuleTest,
  FailedToDeleteRule,
  FailedToLoadRepositoryData,
  FailedToLoadRuleTestCandidates,
  FailedToSaveRule,
  FailedToToggleRule,
  LoadedRepositoryData,
  LoadedRuleTestCandidates,
  type Message,
} from "./message"
import { Repository, RuleDraft, RuleId } from "./model"

export type Command = FoldkitCommand.Command<Message, never, ApiClient>

const failureMessage = (error: { readonly _tag: string }): string => {
  switch (error._tag) {
    case "RepositoryNotConfigured":
      return "This repository is not configured for SlopCop. Enable it in repository settings and retry."
    case "GitHubLabelNotFound":
      return "The selected GitHub label no longer exists. Choose an available label and retry."
    case "GitHubLabelValidationUnavailable":
      return "GitHub labels could not be validated. Your changes are preserved; retry when GitHub is available."
    case "DuplicateLabelingRule":
      return "A rule already uses this GitHub label. Choose another label and retry."
    case "LabelingRuleConflict":
    case "LabelingRulesRevisionConflict":
      return "This rule changed on the server. Your draft is preserved; review the current server rule before retrying."
    case "InvalidLabelingRule":
      return "The rule is invalid. Check every field and retry."
    case "LabelingRuleNotFound":
      return "This rule no longer exists. Close the dialog and reload the repository."
    case "PullRequestNotFound":
      return "That pull request is no longer available. Choose another pull request and retry."
    case "RuleTestCandidatesUnavailable":
      return "Recent pull requests are unavailable. Retry later; no labels were changed."
    case "LabelingRuleTestUnavailable":
      return "The rule test is temporarily unavailable. Retry later; no labels were changed."
    default:
      return "The request failed. Check your connection and retry; no unsaved input was discarded."
  }
}

export const LoadRepositoryData = FoldkitCommand.define("LoadRepositoryData", {
  args: { repository: Repository },
  messages: [LoadedRepositoryData, FailedToLoadRepositoryData],
  execute: ({ repository }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const [rules, labels] = yield* Effect.all([
        client.labelingRules.listRules({
          params: repository,
          query: { includeDisabled: true },
        }),
        client.labelingRules.listGitHubLabels({ params: repository }),
      ])
      return LoadedRepositoryData({
        repository,
        revision: rules.revision,
        rules: rules.rules,
        activity: rules.activity,
        labels: labels.labels,
      })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          FailedToLoadRepositoryData({
            repository,
            message: failureMessage(error),
          }),
        ),
      ),
    ),
})

export const SaveRule = FoldkitCommand.define("SaveRule", {
  args: {
    repository: Repository,
    ruleId: Schema.NullOr(RuleId),
    version: Schema.NullOr(Schema.Int),
    draft: RuleDraft,
  },
  messages: [CompletedSaveRule, FailedToSaveRule],
  execute: ({ draft, repository, ruleId, version }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const payload = {
        name: draft.name,
        label: draft.label,
        kind: draft.kind,
        instructions: draft.instructions,
        confidenceThreshold: draft.confidenceThreshold,
        mode: draft.mode,
        exclusiveGroup:
          draft.exclusiveGroup.trim() === "" ? null : draft.exclusiveGroup,
        enabled: draft.enabled,
      }
      const rule =
        ruleId === null || version === null
          ? yield* client.labelingRules.createRule({
              params: repository,
              payload,
            })
          : yield* client.labelingRules.patchRule({
              params: { ...repository, ruleId },
              payload: { ...payload, version },
            })
      return CompletedSaveRule({ repository, rule })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          FailedToSaveRule({
            repository,
            message: failureMessage(error),
            currentRule:
              error._tag === "LabelingRuleConflict" ||
              error._tag === "LabelingRulesRevisionConflict"
                ? error.currentRule
                : null,
          }),
        ),
      ),
    ),
})

export const ToggleRule = FoldkitCommand.define("ToggleRule", {
  args: {
    repository: Repository,
    ruleId: RuleId,
    version: Schema.Int,
    enabled: Schema.Boolean,
  },
  messages: [CompletedToggleRule, FailedToToggleRule],
  execute: ({ enabled, repository, ruleId, version }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const rule = yield* client.labelingRules.patchRule({
        params: { ...repository, ruleId },
        payload: { enabled, version },
      })
      return CompletedToggleRule({ repository, rule })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          FailedToToggleRule({
            repository,
            ruleId,
            message: failureMessage(error),
          }),
        ),
      ),
    ),
})

export const DeleteRule = FoldkitCommand.define("DeleteRule", {
  args: { repository: Repository, ruleId: RuleId, version: Schema.Int },
  messages: [CompletedDeleteRule, FailedToDeleteRule],
  execute: ({ repository, ruleId, version }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      yield* client.labelingRules.deleteRule({
        params: { ...repository, ruleId },
        query: { version },
      })
      return CompletedDeleteRule({ repository, ruleId })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          FailedToDeleteRule({
            repository,
            message: failureMessage(error),
          }),
        ),
      ),
    ),
})

export const LoadRuleTestCandidates = FoldkitCommand.define(
  "LoadRuleTestCandidates",
  {
    args: { repository: Repository, ruleId: RuleId },
    messages: [LoadedRuleTestCandidates, FailedToLoadRuleTestCandidates],
    execute: ({ repository, ruleId }) =>
      Effect.gen(function* () {
        const client = yield* ApiClient
        const response = yield* client.labelingRules.listRuleTestCandidates({
          params: repository,
          query: { limit: 50 },
        })
        return LoadedRuleTestCandidates({
          repository,
          ruleId,
          candidates: response.candidates,
        })
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            FailedToLoadRuleTestCandidates({
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
    repository: Repository,
    ruleId: RuleId,
    pullRequestNumber: Schema.Int,
  },
  messages: [CompletedRuleTest, FailedRuleTest],
  execute: ({ pullRequestNumber, repository, ruleId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const result = yield* client.labelingRules.testRule({
        params: { ...repository, ruleId },
        payload: { pullRequestNumber },
      })
      return CompletedRuleTest({ repository, result })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          FailedRuleTest({ repository, message: failureMessage(error) }),
        ),
      ),
    ),
})
