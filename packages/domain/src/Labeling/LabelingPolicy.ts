import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import { lifecycleTimestamps } from "../Shared/Timestamps.ts"
import {
  PolicyProgram,
  PolicyId,
  PolicyTarget,
  PolicyVersionId,
} from "../Policy/PolicyProgram.ts"

export const LabelingPolicyId = PolicyId
export const LabelingPolicyName = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
)
export const PolicyDraftMetadata = Schema.Struct({
  description: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(1_000)),
  ),
})
export type PolicyDraftMetadata = typeof PolicyDraftMetadata.Type
const ProgramField = Model.JsonFromString(PolicyProgram)
const StringArrayField = Model.JsonFromString(Schema.Array(Schema.String))

export class LabelingPolicy extends Model.Class<LabelingPolicy>(
  "LabelingPolicy",
)({
  id: Model.UuidV7Insert(LabelingPolicyId),
  repositoryId: GitHubRepositoryId,
  name: LabelingPolicyName,
  target: PolicyTarget,
  publishedVersionId: Schema.NullOr(PolicyVersionId),
  version: Schema.Int,
  ...lifecycleTimestamps,
}) {}

export class LabelingPolicyDraft extends Model.Class<LabelingPolicyDraft>(
  "LabelingPolicyDraft",
)({
  policyId: LabelingPolicyId,
  repositoryId: GitHubRepositoryId,
  program: ProgramField,
  metadata: Model.JsonFromString(PolicyDraftMetadata),
  version: Schema.Int,
  ...lifecycleTimestamps,
}) {}

export class LabelingPolicyVersion extends Model.Class<LabelingPolicyVersion>(
  "LabelingPolicyVersion",
)({
  id: Model.UuidV7Insert(PolicyVersionId),
  policyId: LabelingPolicyId,
  repositoryId: GitHubRepositoryId,
  revision: Schema.Int,
  program: ProgramField,
  contentHash: Schema.String,
  registryManifest: StringArrayField,
  triggerManifest: StringArrayField,
  publicationStatus: Schema.Literals(["staged", "published"]),
  createdAt: Model.DateTimeInsertFromNumber,
}) {}

export const CurrentLabelingPolicy = Schema.Struct({
  policy: LabelingPolicy,
  version: LabelingPolicyVersion,
})
export type CurrentLabelingPolicy = typeof CurrentLabelingPolicy.Type
