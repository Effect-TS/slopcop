import * as Schema from "effect/Schema"
import * as Management from "@slopcop/domain/Labeling/LabelingPolicyManagement"
export class PolicyNotFound extends Schema.TaggedErrorClass<PolicyNotFound>()(
  "PolicyNotFound",
  {
    repository: Schema.String,
    policyId: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}
export class PolicyConflict extends Schema.TaggedErrorClass<PolicyConflict>()(
  "PolicyConflict",
  {
    repository: Schema.String,
    policyId: Schema.String,
    currentPolicy: Management.PublicPolicy,
    currentVersion: Schema.Int,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}
export class PolicyInUse extends Schema.TaggedErrorClass<PolicyInUse>()(
  "PolicyInUse",
  {
    repository: Schema.String,
    policyId: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}
export class InvalidPolicyProgram extends Schema.TaggedErrorClass<InvalidPolicyProgram>()(
  "InvalidPolicyProgram",
  { reason: Schema.String, message: Schema.String },
  { httpApiStatus: 422 },
) {}
export class UnsupportedTarget extends Schema.TaggedErrorClass<UnsupportedTarget>()(
  "UnsupportedTarget",
  { target: Schema.String, message: Schema.String },
  { httpApiStatus: 422 },
) {}
export class PolicyTestUnavailable extends Schema.TaggedErrorClass<PolicyTestUnavailable>()(
  "PolicyTestUnavailable",
  { message: Schema.String, retryable: Schema.Boolean },
  { httpApiStatus: 503 },
) {}
