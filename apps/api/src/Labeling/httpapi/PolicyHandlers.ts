import { RootApi } from "@slopcop/api/RootApi"
import {
  InvalidPolicyProgram,
  PolicyConflict as ApiPolicyConflict,
  PolicyInUse as ApiPolicyInUse,
  PolicyNotFound as ApiPolicyNotFound,
  PolicyTestUnavailable,
  UnsupportedTarget,
} from "@slopcop/api/LabelingPolicies/Errors"
import { RepositoryNotConfigured as ApiRepositoryNotConfigured } from "@slopcop/api/LabelingRules/Errors"
import { PullRequestNotFound } from "@slopcop/api/LabelingRules/Errors"
import * as Management from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import type * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import { Policies, type PoliciesError } from "@slopcop/labeling/Policies"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import { LabelingAdminMiddlewareLayer } from "./Security.ts"
import { LabelingPolicyTester } from "../LabelingPolicyTester.ts"
import type { LabelingPolicyTestError } from "../LabelingPolicyTester.ts"

const decodePolicy = Schema.decodeEffect(Schema.toType(Management.PublicPolicy))
const policyInput = (
  policy: Policy.LabelingPolicy,
  currentVersionId: NonNullable<Policy.LabelingPolicy["publishedVersionId"]>,
) => ({
  id: policy.id,
  name: policy.name,
  target: policy.target,
  currentVersionId,
  version: policy.version,
  createdAt: policy.createdAt,
  updatedAt: policy.updatedAt,
})
const publicPolicy = (policy: Policy.LabelingPolicy) =>
  policy.publishedVersionId === null
    ? Effect.die(`Policy '${policy.id}' has no current version.`)
    : decodePolicy(policyInput(policy, policy.publishedVersionId)).pipe(
        Effect.orDie,
      )
const decodeVersion = Schema.decodeEffect(
  Schema.toType(Management.PublicPolicyVersion),
)
const publicVersion = (version: Policy.LabelingPolicyVersion) =>
  decodeVersion(version).pipe(Effect.orDie)
const decodeDetail = Schema.decodeEffect(
  Schema.toType(Management.PublicPolicyDetail),
)

type PublicPolicyError =
  | ApiRepositoryNotConfigured
  | ApiPolicyNotFound
  | ApiPolicyConflict
  | ApiPolicyInUse
  | InvalidPolicyProgram
  | UnsupportedTarget

const mapError = (
  error: PoliciesError,
): Effect.Effect<never, PublicPolicyError> => {
  switch (error._tag) {
    case "RepositoryNotConfigured":
      return Effect.fail(
        new ApiRepositoryNotConfigured({
          repository: error.repository,
          message: `${error.repository} is not configured.`,
        }),
      )
    case "PolicyNotFound":
      return Effect.fail(
        new ApiPolicyNotFound({
          repository: error.repository,
          policyId: error.policyId,
          message: `Policy '${error.policyId}' does not exist in ${error.repository}.`,
        }),
      )
    case "PolicyConflict":
      return publicPolicy(error.currentPolicy).pipe(
        Effect.flatMap((currentPolicy) =>
          Effect.fail(
            new ApiPolicyConflict({
              repository: error.repository,
              policyId: error.policyId,
              currentPolicy,
              currentVersion: error.currentVersion,
              message: `Policy '${error.policyId}' changed after it was loaded. Refresh and retry.`,
            }),
          ),
        ),
      )
    case "PolicyInUse": {
      const uses = [
        ...(error.rules === 0
          ? []
          : [`${error.rules} labeling rule${error.rules === 1 ? "" : "s"}`]),
        ...(error.policies === 0
          ? []
          : [
              `${error.policies} downstream polic${error.policies === 1 ? "y" : "ies"}`,
            ]),
      ]
      return Effect.fail(
        new ApiPolicyInUse({
          repository: error.repository,
          policyId: error.policyId,
          message: `Policy '${error.policyId}' is still used by ${uses.join(" and ")}. Remove those references before deleting it.`,
        }),
      )
    }
    case "PolicyCompileError":
      return error.reason === "UnsupportedTarget"
        ? Effect.fail(
            new UnsupportedTarget({
              target: "issue",
              message: error.message,
            }),
          )
        : Effect.fail(
            new InvalidPolicyProgram({
              reason: error.reason,
              message: error.message,
            }),
          )
    default:
      return Effect.logError("Policy operation failed", error).pipe(
        Effect.andThen(Effect.die(error)),
      )
  }
}
const mapPolicyTestError = (
  error: LabelingPolicyTestError,
): Effect.Effect<never, PullRequestNotFound | PolicyTestUnavailable> =>
  error.notFound
    ? Effect.fail(
        new PullRequestNotFound({
          repository: error.repository,
          pullRequestNumber: error.pullRequestNumber,
          message: `Pull request #${error.pullRequestNumber} does not exist or is inaccessible.`,
        }),
      )
    : Effect.fail(
        new PolicyTestUnavailable({
          message:
            "The policy test could not be completed. No labels or evaluations were written.",
          retryable: error.retryable,
        }),
      )

const mapPolicyTestOperationError = (
  error: LabelingPolicyTestError | PoliciesError,
): Effect.Effect<
  never,
  PublicPolicyError | PullRequestNotFound | PolicyTestUnavailable
> =>
  error._tag === "LabelingPolicyTestError"
    ? mapPolicyTestError(error)
    : mapError(error)

export const LabelingPoliciesApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "labelingPolicies",
  Effect.fnUntraced(function* (handlers) {
    const policies = yield* Policies
    const tester = yield* LabelingPolicyTester
    return handlers.handleAll({
      listPolicies: Effect.fnUntraced(function* ({ params }) {
        const result = yield* policies.list(params).pipe(Effect.catch(mapError))
        return {
          repository: result.repository,
          revision: result.revision,
          policies: yield* Effect.forEach(result.policies, publicPolicy),
        }
      }),
      getPolicy: ({ params }) =>
        policies.get(params, params.policyId).pipe(
          Effect.catch(mapError),
          Effect.flatMap(({ current, metadata, policy }) => {
            if (policy.publishedVersionId === null)
              return Effect.die(`Policy '${policy.id}' has no current version.`)
            return decodeDetail({
              policy: policyInput(policy, policy.publishedVersionId),
              current: {
                id: current.id,
                program: current.program,
                metadata,
                version: policy.version,
                updatedAt: policy.updatedAt,
              },
            }).pipe(Effect.orDie)
          }),
        ),
      createPolicy: ({ params, payload }) =>
        policies
          .create(params, payload)
          .pipe(Effect.catch(mapError), Effect.flatMap(publicPolicy)),
      savePolicy: ({ params, payload }) =>
        policies
          .save(params, params.policyId, payload)
          .pipe(Effect.catch(mapError), Effect.flatMap(publicPolicy)),
      deletePolicy: ({ params, query }) =>
        policies
          .remove(params, params.policyId, query.version)
          .pipe(Effect.catch(mapError)),
      validatePolicy: ({ params }) =>
        policies.validate(params, params.policyId).pipe(
          Effect.catch(mapError),
          Effect.map(({ facts, nodeCount, references, triggers }) => ({
            facts,
            nodeCount,
            references,
            triggers,
          })),
        ),
      listPolicyVersions: ({ params }) =>
        policies.listVersions(params, params.policyId).pipe(
          Effect.catch(mapError),
          Effect.flatMap((versions) =>
            Effect.forEach(versions, publicVersion).pipe(
              Effect.map((versions) => ({ versions })),
            ),
          ),
        ),
      testPolicy: ({ params, payload }) =>
        tester
          .test(params, params.policyId, payload.pullRequestNumber)
          .pipe(Effect.catch(mapPolicyTestOperationError)),
    })
  }),
).pipe(Layer.provide(LabelingAdminMiddlewareLayer))
