import * as Schema from "effect/Schema"

export const GitHubAppJwtHeader = Schema.Struct({
  alg: Schema.Literal("RS256"),
  typ: Schema.Literal("JWT"),
})
export type GitHubAppJwtHeader = typeof GitHubAppJwtHeader.Type

export const GitHubAppJwtPayload = Schema.Struct({
  iat: Schema.Int,
  exp: Schema.Int,
  iss: Schema.NonEmptyString,
})
export type GitHubAppJwtPayload = typeof GitHubAppJwtPayload.Type

export const GitHubAppJwtHeaderJson = Schema.fromJsonString(GitHubAppJwtHeader)

export const GitHubAppJwtPayloadJson =
  Schema.fromJsonString(GitHubAppJwtPayload)

export const GitHubInstallationTokenResponse = Schema.Struct({
  token: Schema.String,
  expires_at: Schema.DateTimeUtcFromString,
})
export type GitHubInstallationTokenResponse =
  typeof GitHubInstallationTokenResponse.Type
