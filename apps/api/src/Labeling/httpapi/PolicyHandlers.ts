import { RootApi } from "@slopcop/api/RootApi"
import {
  InvalidPolicyProgram,
  PolicyConflict as ApiPolicyConflict,
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
const publicPolicy = (policy: Policy.LabelingPolicy) =>
  decodePolicy(policy).pipe(Effect.orDie)
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
              currentDraftVersion: error.currentDraftVersion,
              message: `Policy '${error.policyId}' changed after it was loaded. Refresh and retry.`,
            }),
          ),
        ),
      )
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
          Effect.flatMap(({ draft, policy }) =>
            decodeDetail({ policy, draft }).pipe(Effect.orDie),
          ),
        ),
      createPolicy: ({ params, payload }) =>
        policies
          .create(params, payload)
          .pipe(Effect.catch(mapError), Effect.flatMap(publicPolicy)),
      patchPolicyDraft: ({ params, payload }) =>
        policies
          .updateDraft(params, params.policyId, payload)
          .pipe(Effect.catch(mapError), Effect.flatMap(publicPolicy)),
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
      publishPolicy: ({ params, payload }) =>
        policies.publish(params, params.policyId, payload.version).pipe(
          Effect.catch(mapError),
          Effect.flatMap(({ compiled, policy, published }) =>
            Effect.all({
              policy: publicPolicy(policy),
              published: publicVersion(published),
              impact: Effect.succeed({
                facts: compiled.facts,
                triggers: compiled.triggers,
              }),
            }),
          ),
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
