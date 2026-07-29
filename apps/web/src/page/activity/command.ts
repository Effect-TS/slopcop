import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import { Effect, Schema as S } from "effect"
import { Command, Http } from "foldkit"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { FailedToLoadActivity, LoadedActivity } from "./message"

const loadActivityEffect = (
  requestId: number,
  repository: string | null,
  operation: typeof LabelingRuleManagement.LabelingRuleAuditFilterOperation.Type,
  cursor: typeof LabelingRuleManagement.LabelingRuleAuditCursor.Type | null,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const query = new URLSearchParams({ limit: "50" })
    if (repository !== null) query.set("repository", repository)
    if (operation !== "all") query.set("operation", operation)
    if (cursor !== null) query.set("cursor", cursor)
    const response = yield* client.execute(
      HttpClientRequest.get(
        `/api/v1/activity/labeling-rules?${query.toString()}`,
      ),
    )
    if (response.status !== 200) {
      return yield* Effect.fail(
        FailedToLoadActivity({
          requestId,
          repository,
          operation,
          cursor,
          message: `The activity request returned HTTP ${response.status}.`,
        }),
      )
    }
    const result = yield* S.decodeUnknownEffect(
      LabelingRuleManagement.ListLabelingRuleActivityResponse,
    )(yield* response.json)
    const repositoriesResponse = yield* client.execute(
      HttpClientRequest.get("/api/v1/repositories"),
    )
    if (repositoriesResponse.status !== 200) {
      return yield* Effect.fail(
        FailedToLoadActivity({
          requestId,
          repository,
          operation,
          cursor,
          message: `The repository-filter request returned HTTP ${repositoriesResponse.status}.`,
        }),
      )
    }
    const repositories = yield* S.decodeUnknownEffect(
      RepositoryManagement.ListRepositoriesResponse,
    )(yield* repositoriesResponse.json)
    return LoadedActivity({
      requestId,
      repository,
      operation,
      cursor,
      entries: result.entries,
      repositories: repositories.repositories.map(({ owner, repo }) => ({
        owner,
        repo,
      })),
      nextCursor: result.nextCursor,
    })
  }).pipe(
    Effect.catchTag("FailedToLoadActivity", Effect.succeed),
    Effect.catch(() =>
      Effect.succeed(
        FailedToLoadActivity({
          requestId,
          repository,
          operation,
          cursor,
          message: "SlopCop could not load activity. Try the request again.",
        }),
      ),
    ),
  )

export const LoadActivity = Command.define(
  "LoadLabelingRuleActivity",
  {
    requestId: S.Int,
    repository: S.NullOr(S.String),
    operation: LabelingRuleManagement.LabelingRuleAuditFilterOperation,
    cursor: S.NullOr(LabelingRuleManagement.LabelingRuleAuditCursor),
  },
  LoadedActivity,
  FailedToLoadActivity,
)(({ requestId, repository, operation, cursor }) =>
  Effect.provide(
    loadActivityEffect(requestId, repository, operation, cursor),
    Http.layer,
  ),
)
