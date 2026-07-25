import * as Schema from "effect/Schema"
import { BaseWebhookEvent } from "./GitHubCommon.ts"
import {
  GitHubInstallationIdFromJson,
  GitHubRepositoryExternalIdFromJson,
  GitHubRepositorySlugFromString,
} from "../GitHubRepository.ts"

export const PullRequest = Schema.Struct({
  id: Schema.Finite,
  node_id: Schema.String,
  title: Schema.String,
  body: Schema.Union([Schema.String, Schema.Null]),
  draft: Schema.Boolean,
  user: Schema.Struct({
    login: Schema.String,
  }),
  head: Schema.Struct({
    sha: Schema.String,
  }),
  base: Schema.Struct({
    ref: Schema.String,
  }),
})
export type PullRequest = typeof PullRequest.Type

export const Repository = Schema.Struct({
  id: GitHubRepositoryExternalIdFromJson,
  slug: GitHubRepositorySlugFromString,
}).pipe(Schema.encodeKeys({ slug: "full_name" }))

export type Repository = typeof Repository.Type

export const BasePullRequestPayload = Schema.Struct({
  number: Schema.Finite,
  pull_request: PullRequest,
  repository: Repository,
  installation: Schema.Struct({
    id: GitHubInstallationIdFromJson,
  }),
})
export type BasePullRequestPayload = typeof BasePullRequestPayload.Type

export const PullRequestOpened = Schema.Struct({
  ...BasePullRequestPayload.fields,
  action: Schema.Literal("opened"),
})
export type PullRequestOpened = typeof PullRequestOpened.Type

export const PullRequestReopened = Schema.Struct({
  ...BasePullRequestPayload.fields,
  action: Schema.Literal("reopened"),
})
export type PullRequestReopened = typeof PullRequestReopened.Type

export const PullRequestSynchronized = Schema.Struct({
  ...BasePullRequestPayload.fields,
  action: Schema.Literal("synchronize"),
})
export type PullRequestSynchronized = typeof PullRequestSynchronized.Type

export const PullRequestEdited = Schema.Struct({
  ...BasePullRequestPayload.fields,
  action: Schema.Literal("edited"),
})
export type PullRequestEdited = typeof PullRequestEdited.Type

export const PullRequestWebhookPayload = Schema.Union([
  PullRequestOpened,
  PullRequestReopened,
  PullRequestSynchronized,
  PullRequestEdited,
])
  .annotate({ message: "Unsupported or malformed pull request webhook action" })
  .pipe(Schema.toTaggedUnion("action"))
export type PullRequestWebhookPayload = typeof PullRequestWebhookPayload.Type

export const PullRequestWebhookEvent = Schema.Struct({
  ...BaseWebhookEvent.fields,
  name: Schema.Literal("pull_request"),
  payload: PullRequestWebhookPayload,
})
export type PullRequestWebhookEvent = typeof PullRequestWebhookEvent.Type
