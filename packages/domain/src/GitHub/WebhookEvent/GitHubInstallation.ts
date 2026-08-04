import * as Schema from "effect/Schema"
import {
  GitHubInstallationRepository,
  GitHubInstallationSummary,
} from "../GitHubInstallation.ts"
import { BaseWebhookEvent } from "./GitHubCommon.ts"

const InstallationPayload = Schema.Struct({
  installation: GitHubInstallationSummary,
})

export const InstallationWebhookPayload = Schema.Union([
  Schema.Struct({
    ...InstallationPayload.fields,
    action: Schema.Literal("created"),
    repositories: Schema.Array(GitHubInstallationRepository),
  }),
  Schema.Struct({
    ...InstallationPayload.fields,
    action: Schema.Literal("deleted"),
  }),
  Schema.Struct({
    ...InstallationPayload.fields,
    action: Schema.Literal("suspend"),
  }),
  Schema.Struct({
    ...InstallationPayload.fields,
    action: Schema.Literal("unsuspend"),
  }),
  Schema.Struct({
    ...InstallationPayload.fields,
    action: Schema.Literal("new_permissions_accepted"),
  }),
]).pipe(Schema.toTaggedUnion("action"))

export const InstallationWebhookEvent = Schema.Struct({
  ...BaseWebhookEvent.fields,
  name: Schema.Literal("installation"),
  payload: InstallationWebhookPayload,
})
export type InstallationWebhookEvent = typeof InstallationWebhookEvent.Type

export const InstallationRepositoriesWebhookPayload = Schema.Struct({
  action: Schema.Literals(["added", "removed"]),
  installation: GitHubInstallationSummary,
  repository_selection: Schema.Literals(["all", "selected"]),
  repositories_added: Schema.Array(GitHubInstallationRepository),
  repositories_removed: Schema.Array(GitHubInstallationRepository),
})

export const InstallationRepositoriesWebhookEvent = Schema.Struct({
  ...BaseWebhookEvent.fields,
  name: Schema.Literal("installation_repositories"),
  payload: InstallationRepositoriesWebhookPayload,
})
export type InstallationRepositoriesWebhookEvent =
  typeof InstallationRepositoriesWebhookEvent.Type
