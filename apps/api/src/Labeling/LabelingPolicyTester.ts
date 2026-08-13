import type * as LabelingPolicy from "@slopcop/domain/Labeling/LabelingPolicy"
import type * as Management from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { Policies, type PoliciesError } from "@slopcop/labeling/Policies"
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
      LabelingPolicyTestError | PoliciesError
    >
  }
>()("@slopcop/api/Labeling/LabelingPolicyTester", {
  make: Effect.gen(function* () {
    const github = yield* GitHubClient
    const repositories = yield* GitHubRepositoriesRepo
    const policies = yield* Policies
    const rows = yield* PoliciesRepo
    const facts = yield* PolicyFacts
    const resolver = {
      resolve: (id: Program.PolicyId) =>
        rows.findCurrentVersion(id).pipe(
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
      const { current } = yield* policies.get(slug, policyId)
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
        program: current.program,
        repositoryId: repository.value.id,
        facts: snapshot,
        resolver,
      })
      return {
        policyId,
        policyVersionId: current.id,
        pullRequestNumber,
        decision,
      }
    })
    return {
      test: (slug, policyId, pullRequestNumber) =>
        test(slug, policyId, pullRequestNumber).pipe(
          Effect.tapError((cause) =>
            cause._tag === "GitHubClientError"
              ? Effect.logError("GitHub policy fact loading failed").pipe(
                  Effect.annotateLogs({
                    repository: `${slug.owner}/${slug.repo}`,
                    policyId,
                    pullRequestNumber,
                    operation: cause.operation,
                    status: cause.status ?? null,
                    retryable: cause.retryable,
                    githubMessage: cause.message,
                  }),
                )
              : Effect.void,
          ),
          Effect.mapError((cause) => {
            switch (cause._tag) {
              case "LabelingPolicyTestError":
              case "RepositoryNotConfigured":
              case "PolicyNotFound":
              case "PolicyConflict":
              case "PolicyCompileError":
              case "PoliciesRepoError":
              case "GitHubRepositoriesRepoError":
                return cause
            }
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
