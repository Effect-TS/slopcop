import * as Schema from "effect/Schema"
import { GitHubRepositorySlug } from "../GitHub/GitHubRepository.ts"
import {
  Condition,
  PolicyEvaluationResult,
  PolicyProgram,
  PolicyTarget,
  PolicyVersionId,
} from "../Policy/PolicyProgram.ts"
import {
  LabelingPolicyId,
  LabelingPolicyName,
  PolicyDraftMetadata,
} from "./LabelingPolicy.ts"
export const PolicyPath = Schema.Struct({
  ...GitHubRepositorySlug.fields,
  policyId: LabelingPolicyId,
})
export const PublicPolicy = Schema.Struct({
  id: LabelingPolicyId,
  name: LabelingPolicyName,
  target: PolicyTarget,
  currentVersionId: PolicyVersionId,
  version: Schema.Int,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
})
export const PublicPolicyVersion = Schema.Struct({
  id: PolicyVersionId,
  policyId: LabelingPolicyId,
  revision: Schema.Int,
  program: PolicyProgram,
  contentHash: Schema.String,
  registryManifest: Schema.Array(Schema.String),
  triggerManifest: Schema.Array(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
})
export const PublicPolicyDetail = Schema.Struct({
  policy: PublicPolicy,
  current: Schema.Struct({
    id: PolicyVersionId,
    program: PolicyProgram,
    metadata: PolicyDraftMetadata,
    version: Schema.Int,
    updatedAt: Schema.DateTimeUtcFromString,
  }),
})
export const CreatePolicyRequest = Schema.Struct({
  name: LabelingPolicyName,
  target: PolicyTarget,
  program: PolicyProgram,
  metadata: PolicyDraftMetadata,
})
export const SavePolicyRequest = Schema.Struct({
  name: Schema.optionalKey(LabelingPolicyName),
  program: Schema.optionalKey(PolicyProgram),
  metadata: Schema.optionalKey(PolicyDraftMetadata),
  version: Schema.Int,
})
export const DeletePolicyQuery = Schema.Struct({ version: Schema.Int })
export const ValidatePolicyResponse = Schema.Struct({
  facts: Schema.Array(Schema.String),
  triggers: Schema.Array(Schema.String),
  references: Schema.Array(LabelingPolicyId),
  nodeCount: Schema.Int,
})
export const ListPoliciesResponse = Schema.Struct({
  repository: Schema.String,
  revision: Schema.Int,
  policies: Schema.Array(PublicPolicy),
})
export const ListPolicyVersionsResponse = Schema.Struct({
  versions: Schema.Array(PublicPolicyVersion),
})
export const TestPolicyRequest = Schema.Struct({
  pullRequestNumber: Schema.Int.check(Schema.isGreaterThan(0)),
})
export const TestPolicyResponse = Schema.Struct({
  policyId: LabelingPolicyId,
  policyVersionId: PolicyVersionId,
  pullRequestNumber: Schema.Int,
  decision: PolicyEvaluationResult,
})
export { Condition }
