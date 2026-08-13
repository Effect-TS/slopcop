import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import * as GitHubLabel from "./GitHubLabel.ts"
import * as GitHubRepository from "./GitHubRepository.ts"

export class GitHubRepositoryLabel extends Model.Class<GitHubRepositoryLabel>(
  "GitHubRepositoryLabel",
)({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  name: GitHubLabel.GitHubLabelName,
  description: Schema.NullOr(Schema.String),
  color: GitHubLabel.GitHubLabelColor,
  generation: Schema.Int,
}) {}
