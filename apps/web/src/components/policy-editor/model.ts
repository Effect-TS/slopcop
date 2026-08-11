import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as Schema from "effect/Schema"

export const PolicyReference = Schema.Struct({
  policyVersionId: PolicyProgram.PolicyVersionId,
  name: Schema.String,
})
export type PolicyReference = typeof PolicyReference.Type

export const MountStatus = Schema.Literals(["Mounting", "Ready", "Failed"])
export const Model = Schema.Struct({
  id: Schema.String,
  source: Schema.String,
  program: Schema.NullOr(PolicyProgram.PolicyProgram),
  error: Schema.NullOr(Schema.String),
  mountStatus: MountStatus,
  references: Schema.Array(PolicyReference),
})
export type Model = typeof Model.Type
