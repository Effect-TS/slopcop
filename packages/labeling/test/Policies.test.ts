import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { Policies } from "@slopcop/labeling/Policies"
import {
  PoliciesRepo,
  PoliciesRepoError,
} from "@slopcop/labeling/repositories/PoliciesRepo"
import { UnexpectedRowCount } from "@slopcop/infra/Sql/RepositoryError"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
const now = DateTime.fromDateUnsafe(new Date("2026-08-10T00:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)("repo"),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("1"),
  owner: "o",
  repo: "r",
  isPrivate: false,
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("2"),
  enabled: true,
  rulesRevision: 4,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const policyId = Schema.decodeUnknownSync(Policy.LabelingPolicyId)("policy")
const versionId = Schema.decodeUnknownSync(Program.PolicyVersionId)("version")
const program: Program.PolicyProgram = {
  target: "pull_request",
  appliesWhen: null,
  matchesWhen: {
    _tag: "FactPredicate",
    fact: "pull_request.draft",
    operator: "Equals",
    value: false,
  },
}
const policy = new Policy.LabelingPolicy({
  id: policyId,
  repositoryId: repository.id,
  name: "Policy",
  target: "pull_request",
  publishedVersionId: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const draft = new Policy.LabelingPolicyDraft({
  policyId,
  repositoryId: repository.id,
  program,
  metadata: {},
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const unavailable = Effect.die("Unexpected call")
interface LayerOptions {
  readonly existing?: Policy.LabelingPolicyVersion | null
  readonly currentPublishedVersionId?: Program.PolicyVersionId | null
  readonly draftProgram?: Program.PolicyProgram
  readonly resolvedVersion?: Policy.LabelingPolicyVersion & {
    readonly target: Program.PolicyTarget
  }
  readonly pointerFails?: boolean
  readonly usage?: { readonly rules: number; readonly policies: number }
}
const layer = (operations: Array<string>, options: LayerOptions = {}) => {
  const existing = options.existing ?? null
  const draftProgram = options.draftProgram ?? program
  const currentPublishedVersionId =
    "currentPublishedVersionId" in options
      ? (options.currentPublishedVersionId ?? null)
      : (existing?.id ?? null)
  let currentPointer = currentPublishedVersionId
  let storedVersion = existing
  return Policies.layerNoDeps.pipe(
    Layer.provide([
      Layer.succeed(GitHubRepositoriesRepo, {
        list: () => unavailable,
        findBySlug: () => Effect.succeed(Option.some(repository)),
        findByGitHubId: () => unavailable,
        findById: () => unavailable,
        getRulesRevision: () => unavailable,
        incrementRulesRevision: () =>
          Effect.sync(() => {
            operations.push("revision")
            return 5
          }),
        updateEnabled: () => unavailable,
        replaceInstallationRepositories: () => unavailable,
      }),
      Layer.succeed(PoliciesRepo, {
        list: () => Effect.succeed([policy]),
        find: () =>
          Effect.succeed(
            Option.some(
              new Policy.LabelingPolicy({
                id: policyId,
                repositoryId: repository.id,
                name: policy.name,
                target: policy.target,
                publishedVersionId: currentPointer,
                version: 1,
                createdAt: now,
                updatedAt: now,
                deletedAt: Option.none(),
              }),
            ),
          ),
        findDraft: () =>
          Effect.succeed(
            Option.some(
              new Policy.LabelingPolicyDraft({
                policyId: draft.policyId,
                repositoryId: draft.repositoryId,
                program: draftProgram,
                metadata: draft.metadata,
                version: draft.version,
                createdAt: draft.createdAt,
                updatedAt: draft.updatedAt,
                deletedAt: draft.deletedAt,
              }),
            ),
          ),
        findVersion: () => Effect.succeed(Option.fromNullishOr(storedVersion)),
        findCurrentVersion: () =>
          Effect.succeed(Option.fromNullishOr(options.resolvedVersion)),
        findVersionByHash: () => Effect.succeed(Option.fromNullishOr(existing)),
        listVersions: () => Effect.succeed([]),
        insertPolicy: () => unavailable,
        insertDraft: () => unavailable,
        updateDraft: () =>
          Effect.sync(() => {
            operations.push("draft")
            return new Policy.LabelingPolicyDraft({
              policyId,
              repositoryId: repository.id,
              program,
              metadata: {},
              version: 2,
              createdAt: now,
              updatedAt: now,
              deletedAt: Option.none(),
            })
          }),
        updatePolicy: (_id, _version, name) =>
          Effect.sync(() => {
            operations.push("policy")
            return new Policy.LabelingPolicy({
              id: policy.id,
              repositoryId: policy.repositoryId,
              name,
              target: policy.target,
              publishedVersionId: currentPointer,
              version: 2,
              createdAt: policy.createdAt,
              updatedAt: policy.updatedAt,
              deletedAt: policy.deletedAt,
            })
          }),
        usage: () => Effect.succeed(options.usage ?? { rules: 0, policies: 0 }),
        remove: () =>
          Effect.sync(() => {
            operations.push("remove")
          }),
        insertVersion: (input) =>
          Effect.sync(() => {
            operations.push("stage")
            storedVersion = new Policy.LabelingPolicyVersion({
              ...input,
              id: versionId,
              createdAt: now,
            })
            return storedVersion
          }),
        insertDependencies: () =>
          Effect.sync(() => {
            operations.push("dependencies")
          }),
        insertTriggers: () =>
          Effect.sync(() => {
            operations.push("triggers")
          }),
        setCurrentVersion: (_id, _version, publishedVersionId) =>
          Effect.suspend(() => {
            operations.push("pointer")
            currentPointer = publishedVersionId
            return options.pointerFails
              ? Effect.fail(
                  new PoliciesRepoError({
                    operation: "Publish",
                    cause: new UnexpectedRowCount({ expected: 1, actual: 0 }),
                  }),
                )
              : Effect.succeed(
                  new Policy.LabelingPolicy({
                    id: policyId,
                    repositoryId: repository.id,
                    name: policy.name,
                    target: policy.target,
                    publishedVersionId,
                    version: _version,
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: Option.none(),
                  }),
                )
          }),
        activateVersion: () =>
          Effect.sync(() => {
            operations.push("activate")
            storedVersion = new Policy.LabelingPolicyVersion({
              id: versionId,
              policyId,
              repositoryId: repository.id,
              revision: 1,
              program,
              contentHash: "hash",
              registryManifest: ["pull_request.draft"],
              triggerManifest: ["pull_request:opened"],
              publicationStatus: "published",
              createdAt: now,
            })
            return storedVersion
          }),
        discardStagedVersions: () =>
          Effect.sync(() => {
            operations.push("discard")
          }),
      }),
    ]),
  )
}
describe("Policies current saves", () => {
  it.effect("removes an unreferenced policy", () => {
    const operations: Array<string> = []
    return Effect.gen(function* () {
      yield* (yield* Policies).remove(repository, policyId, 1)
      expect(operations).toEqual(["remove"])
    }).pipe(Effect.provide(layer(operations)))
  })

  it.effect("rejects deleting a referenced policy", () => {
    const operations: Array<string> = []
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* Policies).remove(repository, policyId, 1),
      )
      expect(error).toMatchObject({
        _tag: "PolicyInUse",
        rules: 2,
        policies: 1,
      })
      expect(operations).toEqual([])
    }).pipe(
      Effect.provide(layer(operations, { usage: { rules: 2, policies: 1 } })),
    )
  })

  it.effect("rejects issue drafts before persistence", () => {
    const operations: Array<string> = []
    return Effect.gen(function* () {
      const service = yield* Policies
      const error = yield* Effect.flip(
        service.create(repository, {
          name: "Issue",
          target: "issue",
          program: { ...program, target: "issue" },
          metadata: {},
        }),
      )
      expect(error).toMatchObject({ reason: "UnsupportedTarget" })
      expect(operations).toEqual([])
    }).pipe(Effect.provide(layer(operations)))
  })
  it.effect(
    "activates complete metadata before moving the policy pointer",
    () => {
      const operations: Array<string> = []
      return Effect.gen(function* () {
        const result = yield* (yield* Policies).save(repository, policyId, {
          program,
          version: 1,
        })
        expect(result.publishedVersionId).toBe(versionId)
        expect(operations).toEqual([
          "draft",
          "policy",
          "discard",
          "stage",
          "dependencies",
          "triggers",
          "activate",
          "pointer",
        ])
      }).pipe(Effect.provide(layer(operations)))
    },
  )
  it.effect(
    "leaves draft and revision untouched when the final pointer CAS fails",
    () => {
      const operations: Array<string> = []
      return Effect.gen(function* () {
        yield* Effect.flip(
          (yield* Policies).save(repository, policyId, { program, version: 1 }),
        )
        expect(operations).toEqual([
          "draft",
          "policy",
          "discard",
          "stage",
          "dependencies",
          "triggers",
          "activate",
          "pointer",
        ])
        expect(operations).toContain("draft")
        expect(operations).not.toContain("revision")
      }).pipe(Effect.provide(layer(operations, { pointerFails: true })))
    },
  )
  it.effect("treats unchanged published content as an idempotent no-op", () => {
    const operations: Array<string> = []
    return Effect.gen(function* () {
      const contentHash = yield* Effect.promise(() =>
        crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(program)),
        ),
      ).pipe(
        Effect.map((digest) =>
          Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join(""),
        ),
      )
      const existing = new Policy.LabelingPolicyVersion({
        id: versionId,
        policyId,
        repositoryId: repository.id,
        revision: 1,
        program,
        contentHash,
        registryManifest: ["pull_request.draft"],
        triggerManifest: ["pull_request:opened"],
        publicationStatus: "published",
        createdAt: now,
      })
      const result = yield* Effect.gen(function* () {
        return yield* (yield* Policies).save(repository, policyId, {
          program,
          version: 1,
        })
      }).pipe(Effect.provide(layer(operations, { existing })))
      expect(result.publishedVersionId).toBe(versionId)
      expect(operations).toEqual(["draft", "policy"])
    })
  })
  it.effect(
    "makes a historical published version current without mutating it",
    () => {
      const operations: Array<string> = []
      return Effect.gen(function* () {
        const contentHash = yield* Effect.promise(() =>
          crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(program)),
          ),
        ).pipe(
          Effect.map((digest) =>
            Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          ),
        )
        const existing = new Policy.LabelingPolicyVersion({
          id: versionId,
          policyId,
          repositoryId: repository.id,
          revision: 1,
          program,
          contentHash,
          registryManifest: ["pull_request.draft"],
          triggerManifest: ["pull_request:opened"],
          publicationStatus: "published",
          createdAt: now,
        })

        const result = yield* Effect.gen(function* () {
          return yield* (yield* Policies).save(repository, policyId, {
            program,
            version: 1,
          })
        }).pipe(
          Effect.provide(
            layer(operations, { existing, currentPublishedVersionId: null }),
          ),
        )

        expect(result.publishedVersionId).toBe(versionId)
        expect(operations).toEqual(["draft", "policy", "pointer"])
      })
    },
  )
  it.effect("resolves a published policy included by another draft", () => {
    const operations: Array<string> = []
    const referencedPolicyId = Schema.decodeUnknownSync(
      Policy.LabelingPolicyId,
    )("referenced-policy")
    const referencedVersionId = Schema.decodeUnknownSync(
      Program.PolicyVersionId,
    )("referenced-version")
    const referencedProgram: Program.PolicyProgram = {
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        _tag: "FactPredicate",
        fact: "pull_request.title",
        operator: "Contains",
        value: "docs",
      },
    }
    const parentProgram: Program.PolicyProgram = {
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        _tag: "PolicyReference",
        policyId: referencedPolicyId,
      },
    }
    const resolvedVersion: NonNullable<LayerOptions["resolvedVersion"]> = {
      id: referencedVersionId,
      policyId: referencedPolicyId,
      repositoryId: repository.id,
      revision: 1,
      program: referencedProgram,
      contentHash: "referenced-hash",
      registryManifest: ["pull_request.title"],
      triggerManifest: ["pull_request:opened"],
      publicationStatus: "published",
      createdAt: now,
      target: "pull_request",
    }
    const current = new Policy.LabelingPolicyVersion({
      id: versionId,
      policyId,
      repositoryId: repository.id,
      revision: 1,
      program: parentProgram,
      contentHash: "parent-hash",
      registryManifest: ["pull_request.title"],
      triggerManifest: ["pull_request:opened"],
      publicationStatus: "published",
      createdAt: now,
    })

    return Effect.gen(function* () {
      const compiled = yield* (yield* Policies).validate(repository, policyId)

      expect(compiled.references).toEqual([referencedPolicyId])
      expect(compiled.facts).toEqual(["pull_request.title"])
      expect(compiled.expandedNodeCount).toBe(2)
    }).pipe(
      Effect.provide(
        layer(operations, {
          draftProgram: parentProgram,
          existing: current,
          resolvedVersion,
        }),
      ),
    )
  })
})
