import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import {
  compilePolicyProgram,
  type CompiledPolicyProgram,
  PolicyCompileError,
} from "./PolicyCompiler.ts"
import { PoliciesRepo } from "./repositories/PoliciesRepo.ts"
export class PolicyNotFound extends Data.TaggedError("PolicyNotFound")<{
  readonly repository: string
  readonly policyId: string
}> {}
export class PolicyConflict extends Data.TaggedError("PolicyConflict")<{
  readonly repository: string
  readonly policyId: string
  readonly currentPolicy: Policy.LabelingPolicy
  readonly currentVersion: number
}> {}
export class PolicyInUse extends Data.TaggedError("PolicyInUse")<{
  readonly repository: string
  readonly policyId: string
  readonly rules: number
  readonly policies: number
}> {}
export type PoliciesError =
  | RepositoryNotConfigured
  | PolicyNotFound
  | PolicyConflict
  | PolicyInUse
  | PolicyCompileError
  | import("./repositories/PoliciesRepo.ts").PoliciesRepoError
  | import("@slopcop/github/repositories/GitHubRepositoriesRepo").GitHubRepositoriesRepoError
type Slug = GitHubRepository.GitHubRepositorySlug
const sha256 = (value: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  ).pipe(
    Effect.map((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    ),
  )

export class Policies extends Context.Service<
  Policies,
  {
    readonly list: (slug: Slug) => Effect.Effect<
      {
        readonly repository: string
        readonly revision: number
        readonly policies: ReadonlyArray<Policy.LabelingPolicy>
      },
      PoliciesError
    >
    readonly get: (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
    ) => Effect.Effect<
      {
        readonly policy: Policy.LabelingPolicy
        readonly current: Policy.LabelingPolicyVersion
        readonly metadata: Policy.PolicyDraftMetadata
      },
      PoliciesError
    >
    readonly create: (
      slug: Slug,
      input: {
        readonly name: string
        readonly target: Program.PolicyTarget
        readonly program: Program.PolicyProgram
        readonly metadata: Policy.PolicyDraftMetadata
      },
    ) => Effect.Effect<Policy.LabelingPolicy, PoliciesError>
    readonly save: (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
      input: {
        readonly name?: string
        readonly program?: Program.PolicyProgram
        readonly metadata?: Policy.PolicyDraftMetadata
        readonly version: number
      },
    ) => Effect.Effect<Policy.LabelingPolicy, PoliciesError>
    readonly remove: (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
      version: number,
    ) => Effect.Effect<void, PoliciesError>
    readonly validate: (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
    ) => Effect.Effect<CompiledPolicyProgram, PoliciesError>
    readonly listVersions: (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
    ) => Effect.Effect<
      ReadonlyArray<Policy.LabelingPolicyVersion>,
      PoliciesError
    >
  }
>()("@slopcop/labeling/Policies", {
  make: Effect.gen(function* () {
    const repositories = yield* GitHubRepositoriesRepo
    const rows = yield* PoliciesRepo
    const requireRepository = Effect.fn("Policies.repository")(function* (
      slug: Slug,
    ) {
      const found = yield* repositories.findBySlug(slug)
      if (Option.isNone(found))
        return yield* new RepositoryNotConfigured({
          repository: `${slug.owner}/${slug.repo}`,
        })
      return found.value
    })
    const requirePolicy = Effect.fn("Policies.policy")(function* (
      repository: GitHubRepository.GitHubRepository,
      id: Policy.LabelingPolicy["id"],
    ) {
      const found = yield* rows.find(repository.id, id)
      if (Option.isNone(found))
        return yield* new PolicyNotFound({
          repository: repository.slug,
          policyId: id,
        })
      return found.value
    })
    const requireDraft = Effect.fn("Policies.draft")(function* (
      id: Policy.LabelingPolicy["id"],
    ) {
      const found = yield* rows.findDraft(id)
      if (Option.isNone(found))
        return yield* new PolicyNotFound({
          repository: "unknown",
          policyId: id,
        })
      return found.value
    })
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
    const validateProgram = Effect.fn("Policies.validateProgram")(function* (
      repository: GitHubRepository.GitHubRepository,
      policyId: Policy.LabelingPolicy["id"],
      program: Program.PolicyProgram,
    ) {
      return yield* compilePolicyProgram(program, resolver, {
        repositoryId: repository.id,
        policyId,
      })
    })
    const activate = Effect.fn("Policies.activate")(function* (
      repository: GitHubRepository.GitHubRepository,
      policy: Policy.LabelingPolicy,
      program: Program.PolicyProgram,
      compiled: CompiledPolicyProgram,
    ) {
      const contentHash = yield* sha256(JSON.stringify(program))
      const existing = yield* rows.findVersionByHash(policy.id, contentHash)
      let version: Policy.LabelingPolicyVersion
      if (Option.isSome(existing)) version = existing.value
      else {
        const previous = yield* rows.listVersions(policy.id)
        yield* rows.discardStagedVersions(policy.id)
        const staged = yield* rows.insertVersion(
          Policy.LabelingPolicyVersion.insert.make({
            policyId: policy.id,
            repositoryId: repository.id,
            revision: (previous[0]?.revision ?? 0) + 1,
            program,
            contentHash,
            registryManifest: compiled.requiresChangedFileContent
              ? [...compiled.facts, "pull_request.changed_files.content"]
              : compiled.facts,
            triggerManifest: compiled.triggers,
            publicationStatus: "staged",
          }),
        )
        yield* rows.insertDependencies(
          staged.id,
          repository.id,
          compiled.references,
        )
        yield* rows.insertTriggers(staged.id, repository.id, compiled.triggers)
        version = yield* rows.activateVersion(staged.id, repository.id)
      }
      if (policy.publishedVersionId !== version.id)
        yield* rows.setCurrentVersion(policy.id, policy.version, version.id)
      return version
    })
    const list = Effect.fn("Policies.list")(function* (slug: Slug) {
      const repository = yield* requireRepository(slug)
      return {
        repository: repository.slug,
        revision: repository.rulesRevision,
        policies: yield* rows.list(repository.id),
      }
    })
    const get = Effect.fn("Policies.get")(function* (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
    ) {
      const repository = yield* requireRepository(slug)
      const policy = yield* requirePolicy(repository, id)
      const content = yield* requireDraft(id)
      if (policy.publishedVersionId === null)
        return yield* new PolicyNotFound({
          repository: repository.slug,
          policyId: id,
        })
      const current = yield* rows.findVersion(policy.publishedVersionId)
      if (Option.isNone(current))
        return yield* new PolicyNotFound({
          repository: repository.slug,
          policyId: id,
        })
      return { policy, current: current.value, metadata: content.metadata }
    })
    const create = Effect.fn("Policies.create")(function* (
      slug: Slug,
      input: {
        readonly name: string
        readonly target: Program.PolicyTarget
        readonly program: Program.PolicyProgram
        readonly metadata: Policy.PolicyDraftMetadata
      },
    ) {
      if (input.target === "issue" || input.program.target === "issue")
        return yield* new PolicyCompileError({
          reason: "UnsupportedTarget",
          message: "Issue policies are not supported yet.",
        })
      if (input.target !== input.program.target)
        return yield* new PolicyCompileError({
          reason: "TargetMismatch",
          message: "Policy target and program target must match.",
        })
      const repository = yield* requireRepository(slug)
      const compiled = yield* compilePolicyProgram(input.program, resolver, {
        repositoryId: repository.id,
      })
      const stored = yield* rows.insertPolicy(
        Policy.LabelingPolicy.insert.make({
          repositoryId: repository.id,
          name: input.name,
          target: input.target,
          publishedVersionId: null,
          version: 1,
        }),
      )
      yield* rows.insertDraft(
        Policy.LabelingPolicyDraft.insert.make({
          policyId: stored.id,
          repositoryId: repository.id,
          program: input.program,
          metadata: input.metadata,
          version: 1,
        }),
      )
      yield* activate(repository, stored, input.program, compiled)
      return yield* requirePolicy(repository, stored.id)
    })
    const save = Effect.fn("Policies.save")(function* (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
      input: {
        readonly name?: string
        readonly program?: Program.PolicyProgram
        readonly metadata?: Policy.PolicyDraftMetadata
        readonly version: number
      },
    ) {
      const repository = yield* requireRepository(slug)
      const policy = yield* requirePolicy(repository, id)
      const draft = yield* requireDraft(id)
      if (draft.version !== input.version || policy.version !== input.version)
        return yield* new PolicyConflict({
          repository: repository.slug,
          policyId: id,
          currentPolicy: policy,
          currentVersion: draft.version,
        })
      if (input.program?.target === "issue")
        return yield* new PolicyCompileError({
          reason: "UnsupportedTarget",
          message: "Issue policies are not supported yet.",
        })
      const program = input.program ?? draft.program
      const compiled = yield* validateProgram(repository, id, program)
      yield* rows.updateDraft(
        id,
        draft.version,
        program,
        input.metadata ?? draft.metadata,
      )
      const updated = yield* rows.updatePolicy(
        id,
        input.version,
        input.name ?? policy.name,
      )
      yield* activate(repository, updated, program, compiled)
      return yield* requirePolicy(repository, id)
    })
    const validate = Effect.fn("Policies.validate")(function* (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
    ) {
      const repository = yield* requireRepository(slug)
      const { current } = yield* get(slug, id)
      return yield* validateProgram(repository, id, current.program)
    })
    const remove = Effect.fn("Policies.remove")(function* (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
      version: number,
    ) {
      const repository = yield* requireRepository(slug)
      const policy = yield* requirePolicy(repository, id)
      const draft = yield* requireDraft(id)
      if (policy.version !== version || draft.version !== version)
        return yield* new PolicyConflict({
          repository: repository.slug,
          policyId: id,
          currentPolicy: policy,
          currentVersion: policy.version,
        })
      const usage = yield* rows.usage(repository.id, id)
      if (usage.rules > 0 || usage.policies > 0)
        return yield* new PolicyInUse({
          repository: repository.slug,
          policyId: id,
          rules: usage.rules,
          policies: usage.policies,
        })
      yield* rows.remove(repository.id, id, version)
    })
    const listVersions = Effect.fn("Policies.listVersions")(function* (
      slug: Slug,
      id: Policy.LabelingPolicy["id"],
    ) {
      yield* requirePolicy(yield* requireRepository(slug), id)
      return yield* rows.listVersions(id)
    })
    return { list, get, create, save, remove, validate, listVersions }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([PoliciesRepo.layer, GitHubRepositoriesRepo.layer]),
  )
}
