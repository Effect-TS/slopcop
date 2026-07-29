import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { Effect, Option, Schema as S } from "effect"
import { Command, Http } from "foldkit"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

import {
  CreatedRule,
  DeletedRule,
  FailedRuleOperation,
  FailedToLoadAuditHistory,
  FailedToLoadWorkspace,
  LoadedWorkspace,
  LoadedAuditHistory,
  UpdatedRule,
} from "./message"

const repositoryFields = LabelingRuleManagement.RepositoryPath.fields
const operation = S.Literals([
  "create",
  "update",
  "enable",
  "disable",
  "validate",
  "delete",
])
type Operation = typeof operation.Type

const ApiError = S.Union([
  S.TaggedStruct("Unauthenticated", { message: S.String }),
  S.TaggedStruct("RepositoryNotConfigured", { message: S.String }),
  S.TaggedStruct("LabelingRuleNotFound", { message: S.String }),
  S.TaggedStruct("GitHubLabelNotFound", { message: S.String }),
  S.TaggedStruct("InvalidLabelingRule", { message: S.String }),
  S.TaggedStruct("DuplicateLabelingRule", { message: S.String }),
  S.TaggedStruct("LabelingRulesRevisionConflict", { message: S.String }),
  S.TaggedStruct("GitHubLabelValidationUnavailable", { message: S.String }),
  S.TaggedStruct("LabelingRuleConflict", {
    message: S.String,
    currentRule: LabelingRuleManagement.PublicLabelingRule,
  }),
])

const repositoryUrl = (owner: string, repo: string) =>
  `/api/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

const failedOperation = (
  owner: string,
  repo: string,
  generation: number,
  operationName: Operation,
  ruleId: typeof LabelingRule.LabelingRuleId.Type | null,
  fallback: string,
  body: unknown,
) => {
  const decoded = S.decodeUnknownOption(ApiError)(body)
  return FailedRuleOperation({
    owner,
    repo,
    generation,
    operation: operationName,
    ruleId,
    message: Option.isSome(decoded) ? decoded.value.message : fallback,
    currentRule:
      Option.isSome(decoded) && decoded.value._tag === "LabelingRuleConflict"
        ? decoded.value.currentRule
        : null,
  })
}

const loadWorkspaceEffect = (owner: string, repo: string, generation: number) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const baseUrl = repositoryUrl(owner, repo)
    const rulesResponse = yield* client.execute(
      HttpClientRequest.get(`${baseUrl}/labeling-rules?includeDisabled=true`),
    )
    if (rulesResponse.status !== 200) {
      return yield* Effect.fail(
        FailedToLoadWorkspace({
          owner,
          repo,
          generation,
          message: `The labeling-rules request returned HTTP ${rulesResponse.status}.`,
        }),
      )
    }
    const rules = yield* S.decodeUnknownEffect(
      LabelingRuleManagement.ListLabelingRulesResponse,
    )(yield* rulesResponse.json)
    const labelsResponse = yield* client.execute(
      HttpClientRequest.get(`${baseUrl}/github-labels`),
    )
    if (labelsResponse.status !== 200) {
      return yield* Effect.fail(
        FailedToLoadWorkspace({
          owner,
          repo,
          generation,
          message: `The GitHub-label request returned HTTP ${labelsResponse.status}.`,
        }),
      )
    }
    const labels = yield* S.decodeUnknownEffect(
      LabelingRuleManagement.ListGitHubLabelsResponse,
    )(yield* labelsResponse.json)
    return LoadedWorkspace({
      owner,
      repo,
      generation,
      revision: rules.revision,
      rules: rules.rules,
      labels: labels.labels,
    })
  }).pipe(
    Effect.catchTag("FailedToLoadWorkspace", Effect.succeed),
    Effect.catch(() =>
      Effect.succeed(
        FailedToLoadWorkspace({
          owner,
          repo,
          generation,
          message:
            "SlopCop could not load labeling rules and GitHub labels. Try the request again.",
        }),
      ),
    ),
  )

export const LoadWorkspace = Command.define(
  "LoadRepositoryWorkspace",
  { ...repositoryFields, generation: S.Int },
  LoadedWorkspace,
  FailedToLoadWorkspace,
)(({ owner, repo, generation }) =>
  Effect.provide(loadWorkspaceEffect(owner, repo, generation), Http.layer),
)

const createRuleEffect = (
  owner: string,
  repo: string,
  generation: number,
  request: LabelingRuleManagement.CreateLabelingRuleRequest,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const baseUrl = `${repositoryUrl(owner, repo)}/labeling-rules`
    const httpRequest = yield* HttpClientRequest.post(baseUrl).pipe(
      HttpClientRequest.schemaBodyJson(
        LabelingRuleManagement.CreateLabelingRuleRequest,
      )(request),
    )
    const response = yield* client.execute(httpRequest)
    if (response.status !== 201) {
      return failedOperation(
        owner,
        repo,
        generation,
        "create",
        null,
        `The rule create request returned HTTP ${response.status}.`,
        yield* response.json,
      )
    }
    const rule = yield* S.decodeUnknownEffect(
      LabelingRuleManagement.PublicLabelingRule,
    )(yield* response.json)
    return CreatedRule({ owner, repo, generation, rule })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(
        FailedRuleOperation({
          owner,
          repo,
          generation,
          operation: "create",
          ruleId: null,
          message:
            "SlopCop could not create the rule. No configuration was changed.",
          currentRule: null,
        }),
      ),
    ),
  )

export const CreateRule = Command.define(
  "CreateLabelingRule",
  {
    ...repositoryFields,
    generation: S.Int,
    request: LabelingRuleManagement.CreateLabelingRuleRequest,
  },
  CreatedRule,
  FailedRuleOperation,
)(({ owner, repo, generation, request }) =>
  Effect.provide(
    createRuleEffect(owner, repo, generation, request),
    Http.layer,
  ),
)

const updateRuleEffect = (
  owner: string,
  repo: string,
  generation: number,
  ruleId: typeof LabelingRule.LabelingRuleId.Type,
  request: LabelingRuleManagement.PatchLabelingRuleRequest,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const url = `${repositoryUrl(owner, repo)}/labeling-rules/${encodeURIComponent(ruleId)}`
    const httpRequest = yield* HttpClientRequest.patch(url).pipe(
      HttpClientRequest.schemaBodyJson(
        LabelingRuleManagement.PatchLabelingRuleRequest,
      )(request),
    )
    const response = yield* client.execute(httpRequest)
    if (response.status !== 200) {
      return failedOperation(
        owner,
        repo,
        generation,
        "update",
        ruleId,
        `The rule update request returned HTTP ${response.status}.`,
        yield* response.json,
      )
    }
    const rule = yield* S.decodeUnknownEffect(
      LabelingRuleManagement.PublicLabelingRule,
    )(yield* response.json)
    return UpdatedRule({ owner, repo, generation, operation: "update", rule })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(
        FailedRuleOperation({
          owner,
          repo,
          generation,
          operation: "update",
          ruleId,
          message:
            "SlopCop could not update the rule. No configuration was changed.",
          currentRule: null,
        }),
      ),
    ),
  )

export const UpdateRule = Command.define(
  "UpdateLabelingRule",
  {
    ...repositoryFields,
    generation: S.Int,
    ruleId: LabelingRule.LabelingRuleId,
    request: LabelingRuleManagement.PatchLabelingRuleRequest,
  },
  UpdatedRule,
  FailedRuleOperation,
)(({ owner, repo, generation, ruleId, request }) =>
  Effect.provide(
    updateRuleEffect(owner, repo, generation, ruleId, request),
    Http.layer,
  ),
)

const mutateRuleEffect = (
  owner: string,
  repo: string,
  generation: number,
  ruleId: typeof LabelingRule.LabelingRuleId.Type,
  version: number,
  operationName: "enable" | "disable" | "validate",
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const ruleUrl = `${repositoryUrl(owner, repo)}/labeling-rules/${encodeURIComponent(ruleId)}`
    const request =
      operationName === "enable"
        ? yield* HttpClientRequest.patch(ruleUrl).pipe(
            HttpClientRequest.schemaBodyJson(
              LabelingRuleManagement.PatchLabelingRuleRequest,
            )({ enabled: true, version }),
          )
        : operationName === "disable"
          ? yield* HttpClientRequest.post(`${ruleUrl}/disable`).pipe(
              HttpClientRequest.schemaBodyJson(
                LabelingRuleManagement.RuleVersionRequest,
              )({ version }),
            )
          : HttpClientRequest.post(`${ruleUrl}/validate`)
    const response = yield* client.execute(request)
    if (response.status !== 200) {
      return failedOperation(
        owner,
        repo,
        generation,
        operationName,
        ruleId,
        `The rule ${operationName} request returned HTTP ${response.status}.`,
        yield* response.json,
      )
    }
    const rule = yield* S.decodeUnknownEffect(
      LabelingRuleManagement.PublicLabelingRule,
    )(yield* response.json)
    return UpdatedRule({
      owner,
      repo,
      generation,
      operation: operationName,
      rule,
    })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(
        FailedRuleOperation({
          owner,
          repo,
          generation,
          operation: operationName,
          ruleId,
          message: `SlopCop could not ${operationName} the rule. The previous rule was preserved.`,
          currentRule: null,
        }),
      ),
    ),
  )

export const SetRuleState = Command.define(
  "SetLabelingRuleState",
  {
    ...repositoryFields,
    generation: S.Int,
    ruleId: LabelingRule.LabelingRuleId,
    version: S.Int,
    operation: S.Literals(["enable", "disable"]),
  },
  UpdatedRule,
  FailedRuleOperation,
)(({ owner, repo, generation, ruleId, version, operation }) =>
  Effect.provide(
    mutateRuleEffect(owner, repo, generation, ruleId, version, operation),
    Http.layer,
  ),
)

export const RevalidateRule = Command.define(
  "RevalidateLabelingRule",
  {
    ...repositoryFields,
    generation: S.Int,
    ruleId: LabelingRule.LabelingRuleId,
    version: S.Int,
  },
  UpdatedRule,
  FailedRuleOperation,
)(({ owner, repo, generation, ruleId, version }) =>
  Effect.provide(
    mutateRuleEffect(owner, repo, generation, ruleId, version, "validate"),
    Http.layer,
  ),
)

const deleteRuleEffect = (
  owner: string,
  repo: string,
  generation: number,
  ruleId: typeof LabelingRule.LabelingRuleId.Type,
  version: number,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const url = `${repositoryUrl(owner, repo)}/labeling-rules/${encodeURIComponent(ruleId)}?version=${encodeURIComponent(String(version))}`
    const response = yield* client.execute(HttpClientRequest.delete(url))
    if (response.status !== 204) {
      return failedOperation(
        owner,
        repo,
        generation,
        "delete",
        ruleId,
        `The rule delete request returned HTTP ${response.status}.`,
        yield* response.json,
      )
    }
    return DeletedRule({ owner, repo, generation, ruleId })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(
        FailedRuleOperation({
          owner,
          repo,
          generation,
          operation: "delete",
          ruleId,
          message:
            "SlopCop could not delete the rule. The disabled rule was preserved.",
          currentRule: null,
        }),
      ),
    ),
  )

export const DeleteRule = Command.define(
  "DeleteLabelingRule",
  {
    ...repositoryFields,
    generation: S.Int,
    ruleId: LabelingRule.LabelingRuleId,
    version: S.Int,
  },
  DeletedRule,
  FailedRuleOperation,
)(({ owner, repo, generation, ruleId, version }) =>
  Effect.provide(
    deleteRuleEffect(owner, repo, generation, ruleId, version),
    Http.layer,
  ),
)

const loadAuditHistoryEffect = (
  owner: string,
  repo: string,
  generation: number,
  requestId: number,
  ruleId: typeof LabelingRule.LabelingRuleId.Type | null,
  operation: typeof LabelingRuleManagement.LabelingRuleAuditFilterOperation.Type,
  cursor: typeof LabelingRuleManagement.LabelingRuleAuditCursor.Type | null,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const query = new URLSearchParams({ limit: "25" })
    if (ruleId !== null) query.set("ruleId", ruleId)
    if (operation !== "all") query.set("operation", operation)
    if (cursor !== null) query.set("cursor", cursor)
    const response = yield* client.execute(
      HttpClientRequest.get(
        `${repositoryUrl(owner, repo)}/labeling-rules/audit?${query.toString()}`,
      ),
    )
    if (response.status !== 200) {
      return yield* Effect.fail(
        FailedToLoadAuditHistory({
          owner,
          repo,
          generation,
          requestId,
          ruleId,
          operation,
          cursor,
          message: `The audit-history request returned HTTP ${response.status}.`,
        }),
      )
    }
    const result = yield* S.decodeUnknownEffect(
      LabelingRuleManagement.ListLabelingRuleAuditResponse,
    )(yield* response.json)
    return LoadedAuditHistory({
      owner,
      repo,
      generation,
      requestId,
      ruleId,
      operation,
      cursor,
      entries: result.entries,
      nextCursor: result.nextCursor,
    })
  }).pipe(
    Effect.catchTag("FailedToLoadAuditHistory", Effect.succeed),
    Effect.catch(() =>
      Effect.succeed(
        FailedToLoadAuditHistory({
          owner,
          repo,
          generation,
          requestId,
          ruleId,
          operation,
          cursor,
          message:
            "SlopCop could not load rule history. The current rules remain available.",
        }),
      ),
    ),
  )

export const LoadAuditHistory = Command.define(
  "LoadLabelingRuleAuditHistory",
  {
    ...repositoryFields,
    generation: S.Int,
    requestId: S.Int,
    ruleId: S.NullOr(LabelingRule.LabelingRuleId),
    operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
    cursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
  },
  LoadedAuditHistory,
  FailedToLoadAuditHistory,
)(({ owner, repo, generation, requestId, ruleId, operation, cursor }) =>
  Effect.provide(
    loadAuditHistoryEffect(
      owner,
      repo,
      generation,
      requestId,
      ruleId,
      operation,
      cursor,
    ),
    Http.layer,
  ),
)
