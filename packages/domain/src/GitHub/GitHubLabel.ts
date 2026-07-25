import * as Schema from "effect/Schema"

export const GitHubLabelName = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(50),
)
export type GitHubLabelName = typeof GitHubLabelName.Type

export const GitHubLabelColor = Schema.String.check(
  Schema.isPattern(/^[0-9a-fA-F]{6}$/),
)
export type GitHubLabelColor = typeof GitHubLabelColor.Type

export const GitHubLabel = Schema.Struct({
  name: GitHubLabelName,
  description: Schema.NullOr(Schema.String),
  color: GitHubLabelColor,
})
export type GitHubLabel = typeof GitHubLabel.Type

export const GitHubLabelValidationResult = Schema.Union([
  Schema.Struct({
    exists: Schema.Literal(true),
    label: GitHubLabel,
  }),
  Schema.Struct({
    exists: Schema.Literal(false),
  }),
])
export type GitHubLabelValidationResult =
  typeof GitHubLabelValidationResult.Type
