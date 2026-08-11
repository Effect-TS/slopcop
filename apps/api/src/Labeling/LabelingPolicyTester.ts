import type * as LabelingPolicy from "@slopcop/domain/Labeling/LabelingPolicy"
import type * as Management from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { Policies } from "@slopcop/labeling/Policies"
import { PolicyAi } from "@slopcop/labeling/PolicyAi"
import { evaluatePolicyProgram } from "@slopcop/labeling/PolicyEngine"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
import { PoliciesRepo } from "@slopcop/labeling/repositories/PoliciesRepo"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"

export class LabelingPolicyTestError extends Data.TaggedError(
  "LabelingPolicyTestError",
)<{
  readonly repository: string
  readonly pullRequestNumber: number
  readonly retryable: boolean
  readonly notFound: boolean
  readonly cause: unknown
}> {}

export class LabelingPolicyTester extends Context.Service<
  LabelingPolicyTester,
  {
    readonly test: (
      slug: { readonly owner: string; readonly repo: string },
      policyId: LabelingPolicy.LabelingPolicy["id"],
      pullRequestNumber: number,
    ) => Effect.Effect<
      typeof Management.TestPolicyResponse.Type,
      LabelingPolicyTestError
    >
  }
>()("@slopcop/api/Labeling/LabelingPolicyTester", {
  make: Effect.gen(function* () {
    const github = yield* GitHubClient
    const repositories = yield* GitHubRepositoriesRepo
    const policies = yield* Policies
    const rows = yield* PoliciesRepo
    const ai = yield* PolicyAi
    const facts = yield* PolicyFacts
    const resolver = {
      resolve: (id: Program.PolicyVersionId) =>
        rows.findResolvedVersion(id).pipe(
          Effect.map(
            Option.match({
              onNone: () => null,
              onSome: (version) => ({
                id: version.id,
                policyId: version.policyId,
                repositoryId: version.repositoryId,
                target: version.target,
                program: version.program,
              }),
            }),
          ),
        ),
    }
    const test = Effect.fn("LabelingPolicyTester.test")(function* (
      slug: { readonly owner: string; readonly repo: string },
      policyId: LabelingPolicy.LabelingPolicy["id"],
      pullRequestNumber: number,
    ) {
      const { draft } = yield* policies.get(slug, policyId)
      const compiled = yield* policies.validate(slug, policyId)
      const repository = yield* repositories.findBySlug(slug)
      if (Option.isNone(repository))
        return yield* new LabelingPolicyTestError({
          repository: `${slug.owner}/${slug.repo}`,
          pullRequestNumber,
          retryable: false,
          notFound: false,
          cause: `${slug.owner}/${slug.repo} is not configured.`,
        })
      const summary = yield* github.getPullRequest(
        repository.value,
        pullRequestNumber,
      )
      const labels = yield* github
        .listItemLabels(repository.value, pullRequestNumber)
        .pipe(
          Stream.runCollect,
          Effect.map((items) => new Set(items.map((item) => item.name))),
        )
      const snapshot = yield* facts.load(
        repository.value,
        summary,
        new Set([
          ...compiled.facts,
          ...(compiled.requiresChangedFileContent
            ? ["pull_request.changed_files.content"]
            : []),
        ]),
        labels,
      )
      const decision = yield* evaluatePolicyProgram({
        program: draft.program,
        repositoryId: repository.value.id,
        facts: snapshot,
        ai,
        resolver,
      })
      return {
        policyId,
        tested: { _tag: "Draft" as const, version: draft.version },
        pullRequestNumber,
        decision,
      }
    })
    return {
      test: (slug, policyId, pullRequestNumber) =>
        test(slug, policyId, pullRequestNumber).pipe(
          Effect.mapError((cause) => {
            if (cause._tag === "LabelingPolicyTestError") return cause
            const notFound =
              cause._tag === "GitHubClientError" &&
              cause.operation === "GitHubClient.getPullRequest" &&
              cause.status === 404
            return new LabelingPolicyTestError({
              repository: `${slug.owner}/${slug.repo}`,
              pullRequestNumber,
              retryable:
                cause._tag === "GitHubClientError" ? cause.retryable : false,
              notFound,
              cause,
            })
          }),
        ),
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
}
