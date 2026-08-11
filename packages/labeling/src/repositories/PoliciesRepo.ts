import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Policy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import type { RepositoryErrorCause } from "@slopcop/infra/Sql/RepositoryError"
import { UnexpectedRowCount } from "@slopcop/infra/Sql/RepositoryError"
export class PoliciesRepoError extends Data.TaggedError("PoliciesRepoError")<{
  readonly operation: string
  readonly cause: RepositoryErrorCause
}> {}
const RepositoryRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
})
const PolicyRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  policyId: Policy.LabelingPolicyId,
})
const VersionRequest = Schema.Struct({ versionId: Program.PolicyVersionId })
const PolicyReferenceRequest = Schema.Struct({ policyId: Program.PolicyId })
export const ResolvedPolicyVersionRow = Schema.Struct({
  ...Policy.LabelingPolicyVersion.select.fields,
  repositoryId: GitHubRepository.GitHubRepositoryId,
  target: Program.PolicyTarget,
})
export type ResolvedPolicyVersionRow = typeof ResolvedPolicyVersionRow.Type
const VersionListRequest = Schema.Struct({ policyId: Policy.LabelingPolicyId })
const VersionHashRequest = Schema.Struct({
  policyId: Policy.LabelingPolicyId,
  contentHash: Schema.String,
})
const VersionRepositoryRequest = Schema.Struct({
  versionId: Program.PolicyVersionId,
  repositoryId: GitHubRepository.GitHubRepositoryId,
})
const UpdateDraftRequest = Schema.Struct({
  policyId: Policy.LabelingPolicyId,
  expectedVersion: Schema.Int,
  program: Program.PolicyProgram,
  metadata: Policy.PolicyDraftMetadata,
})
const PublishRequest = Schema.Struct({
  policyId: Policy.LabelingPolicyId,
  expectedVersion: Schema.Int,
  versionId: Program.PolicyVersionId,
})
const UpdatePolicyRequest = Schema.Struct({
  policyId: Policy.LabelingPolicyId,
  expectedVersion: Schema.Int,
  name: Policy.LabelingPolicyName,
})
const RemovePolicyRequest = Schema.Struct({
  repositoryId: GitHubRepository.GitHubRepositoryId,
  policyId: Policy.LabelingPolicyId,
  expectedVersion: Schema.Int,
})
const PolicyUsage = Schema.Struct({
  rules: Schema.Int,
  policies: Schema.Int,
})
export class PoliciesRepo extends Context.Service<
  PoliciesRepo,
  {
    readonly list: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
    ) => Effect.Effect<ReadonlyArray<Policy.LabelingPolicy>, PoliciesRepoError>
    readonly find: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      policyId: Policy.LabelingPolicy["id"],
    ) => Effect.Effect<Option.Option<Policy.LabelingPolicy>, PoliciesRepoError>
    readonly findDraft: (
      policyId: Policy.LabelingPolicy["id"],
    ) => Effect.Effect<
      Option.Option<Policy.LabelingPolicyDraft>,
      PoliciesRepoError
    >
    readonly findVersion: (
      versionId: Program.PolicyVersionId,
    ) => Effect.Effect<
      Option.Option<Policy.LabelingPolicyVersion>,
      PoliciesRepoError
    >
    readonly findCurrentVersion: (
      policyId: Program.PolicyId,
    ) => Effect.Effect<
      Option.Option<ResolvedPolicyVersionRow>,
      PoliciesRepoError
    >
    readonly findVersionByHash: (
      policyId: Policy.LabelingPolicy["id"],
      contentHash: string,
    ) => Effect.Effect<
      Option.Option<Policy.LabelingPolicyVersion>,
      PoliciesRepoError
    >
    readonly listVersions: (
      policyId: Policy.LabelingPolicy["id"],
    ) => Effect.Effect<
      ReadonlyArray<Policy.LabelingPolicyVersion>,
      PoliciesRepoError
    >
    readonly insertPolicy: (
      input: typeof Policy.LabelingPolicy.insert.Type,
    ) => Effect.Effect<Policy.LabelingPolicy, PoliciesRepoError>
    readonly insertDraft: (
      input: typeof Policy.LabelingPolicyDraft.insert.Type,
    ) => Effect.Effect<Policy.LabelingPolicyDraft, PoliciesRepoError>
    readonly updateDraft: (
      policyId: Policy.LabelingPolicy["id"],
      expectedVersion: number,
      program: Program.PolicyProgram,
      metadata: Policy.PolicyDraftMetadata,
    ) => Effect.Effect<Policy.LabelingPolicyDraft, PoliciesRepoError>
    readonly updatePolicy: (
      policyId: Policy.LabelingPolicy["id"],
      expectedVersion: number,
      name: Policy.LabelingPolicy["name"],
    ) => Effect.Effect<Policy.LabelingPolicy, PoliciesRepoError>
    readonly usage: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      policyId: Policy.LabelingPolicy["id"],
    ) => Effect.Effect<typeof PolicyUsage.Type, PoliciesRepoError>
    readonly remove: (
      repositoryId: GitHubRepository.GitHubRepository["id"],
      policyId: Policy.LabelingPolicy["id"],
      expectedVersion: number,
    ) => Effect.Effect<void, PoliciesRepoError>
    readonly insertVersion: (
      input: typeof Policy.LabelingPolicyVersion.insert.Type,
    ) => Effect.Effect<Policy.LabelingPolicyVersion, PoliciesRepoError>
    readonly insertDependencies: (
      versionId: Program.PolicyVersionId,
      repositoryId: GitHubRepository.GitHubRepository["id"],
      dependencies: ReadonlyArray<Program.PolicyId>,
    ) => Effect.Effect<void, PoliciesRepoError>
    readonly insertTriggers: (
      versionId: Program.PolicyVersionId,
      repositoryId: GitHubRepository.GitHubRepository["id"],
      triggers: ReadonlyArray<string>,
    ) => Effect.Effect<void, PoliciesRepoError>
    readonly setCurrentVersion: (
      policyId: Policy.LabelingPolicy["id"],
      expectedVersion: number,
      versionId: Program.PolicyVersionId,
    ) => Effect.Effect<Policy.LabelingPolicy, PoliciesRepoError>
    readonly activateVersion: (
      versionId: Program.PolicyVersionId,
      repositoryId: GitHubRepository.GitHubRepository["id"],
    ) => Effect.Effect<Policy.LabelingPolicyVersion, PoliciesRepoError>
    readonly discardStagedVersions: (
      policyId: Policy.LabelingPolicy["id"],
    ) => Effect.Effect<void, PoliciesRepoError>
  }
>()("@slopcop/labeling/repositories/PoliciesRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const list = SqlSchema.findAll({
      Request: RepositoryRequest,
      Result: Policy.LabelingPolicy,
      execute: ({ repositoryId }) =>
        sql`SELECT * FROM labeling_policies WHERE repository_id=${repositoryId} AND deleted_at IS NULL ORDER BY created_at,id`,
    })
    const find = SqlSchema.findOneOption({
      Request: PolicyRequest,
      Result: Policy.LabelingPolicy,
      execute: ({ repositoryId, policyId }) =>
        sql`SELECT * FROM labeling_policies WHERE repository_id=${repositoryId} AND id=${policyId} AND deleted_at IS NULL`,
    })
    const draft = SqlSchema.findOneOption({
      Request: VersionListRequest,
      Result: Policy.LabelingPolicyDraft,
      execute: ({ policyId }) =>
        sql`SELECT * FROM labeling_policy_drafts WHERE policy_id=${policyId} AND deleted_at IS NULL`,
    })
    const version = SqlSchema.findOneOption({
      Request: VersionRequest,
      Result: Policy.LabelingPolicyVersion,
      execute: ({ versionId }) =>
        sql`SELECT * FROM labeling_policy_versions WHERE id=${versionId} AND publication_status='published'`,
    })
    const currentVersion = SqlSchema.findOneOption({
      Request: PolicyReferenceRequest,
      Result: ResolvedPolicyVersionRow,
      execute: ({ policyId }) => sql`
        SELECT version.*, policy.repository_id, policy.target
        FROM labeling_policies AS policy
        INNER JOIN labeling_policy_versions AS version ON version.id=policy.published_version_id
        LEFT JOIN labeling_policy_versions AS legacy ON legacy.id=${policyId}
        WHERE (policy.id=${policyId} OR legacy.policy_id=policy.id)
          AND policy.deleted_at IS NULL`,
    })
    const versions = SqlSchema.findAll({
      Request: VersionListRequest,
      Result: Policy.LabelingPolicyVersion,
      execute: ({ policyId }) =>
        sql`SELECT * FROM labeling_policy_versions WHERE policy_id=${policyId} ORDER BY revision DESC`,
    })
    const versionByHash = SqlSchema.findOneOption({
      Request: VersionHashRequest,
      Result: Policy.LabelingPolicyVersion,
      execute: ({ contentHash, policyId }) =>
        sql`SELECT * FROM labeling_policy_versions WHERE policy_id=${policyId} AND content_hash=${contentHash}`,
    })
    const insertPolicy = SqlSchema.findOneOption({
      Request: Policy.LabelingPolicy.insert,
      Result: Policy.LabelingPolicy,
      execute: (input) =>
        sql`INSERT INTO labeling_policies ${sql.insert(input)} RETURNING *`,
    })
    const insertDraft = SqlSchema.findOneOption({
      Request: Policy.LabelingPolicyDraft.insert,
      Result: Policy.LabelingPolicyDraft,
      execute: (input) =>
        sql`INSERT INTO labeling_policy_drafts ${sql.insert(input)} RETURNING *`,
    })
    const updateDraft = SqlSchema.findOneOption({
      Request: UpdateDraftRequest,
      Result: Policy.LabelingPolicyDraft,
      execute: ({ policyId, expectedVersion, program, metadata }) =>
        sql`UPDATE labeling_policy_drafts SET program=${JSON.stringify(program)},metadata=${JSON.stringify(metadata)},version=version+1,updated_at=unixepoch()*1000 WHERE policy_id=${policyId} AND version=${expectedVersion} AND deleted_at IS NULL RETURNING *`,
    })
    const updatePolicy = SqlSchema.findOneOption({
      Request: UpdatePolicyRequest,
      Result: Policy.LabelingPolicy,
      execute: ({ expectedVersion, name, policyId }) =>
        sql`UPDATE labeling_policies SET name=${name},version=version+1,updated_at=unixepoch()*1000 WHERE id=${policyId} AND version=${expectedVersion} AND deleted_at IS NULL RETURNING *`,
    })
    const usage = SqlSchema.findOneOption({
      Request: PolicyRequest,
      Result: PolicyUsage,
      execute: ({ policyId, repositoryId }) => sql`
        SELECT
          (SELECT count(*) FROM labeling_rules
            WHERE repository_id=${repositoryId} AND deleted_at IS NULL
              AND (policy_id=${policyId} OR gate_policy_id=${policyId})) AS rules,
          (SELECT count(*) FROM labeling_policy_dependencies AS dependency
            INNER JOIN labeling_policies AS parent
              ON parent.published_version_id=dependency.policy_version_id
            INNER JOIN labeling_policy_versions AS referenced
              ON referenced.id=dependency.dependency_version_id
            WHERE parent.repository_id=${repositoryId} AND parent.deleted_at IS NULL
              AND referenced.policy_id=${policyId}) AS policies`,
    })
    const remove = SqlSchema.findOneOption({
      Request: RemovePolicyRequest,
      Result: Policy.LabelingPolicy,
      execute: ({ expectedVersion, policyId, repositoryId }) => sql`
        UPDATE labeling_policies SET deleted_at=unixepoch()*1000,
          updated_at=unixepoch()*1000,version=version+1
        WHERE id=${policyId} AND repository_id=${repositoryId}
          AND version=${expectedVersion} AND deleted_at IS NULL RETURNING *`,
    })
    const insertVersion = SqlSchema.findOneOption({
      Request: Policy.LabelingPolicyVersion.insert,
      Result: Policy.LabelingPolicyVersion,
      execute: (input) =>
        sql`INSERT INTO labeling_policy_versions ${sql.insert(input)} RETURNING *`,
    })
    const publish = SqlSchema.findOneOption({
      Request: PublishRequest,
      Result: Policy.LabelingPolicy,
      execute: ({ policyId, expectedVersion, versionId }) =>
        sql`UPDATE labeling_policies SET published_version_id=${versionId},updated_at=unixepoch()*1000 WHERE id=${policyId} AND version=${expectedVersion} RETURNING *`,
    })
    const activateVersion = SqlSchema.findOneOption({
      Request: VersionRepositoryRequest,
      Result: Policy.LabelingPolicyVersion,
      execute: ({ repositoryId, versionId }) =>
        sql`UPDATE labeling_policy_versions SET publication_status='published' WHERE id=${versionId} AND repository_id=${repositoryId} AND publication_status='staged' RETURNING *`,
    })
    const discardStagedVersions = SqlSchema.void({
      Request: VersionListRequest,
      execute: ({ policyId }) =>
        sql`DELETE FROM labeling_policy_versions WHERE policy_id=${policyId} AND publication_status='staged'`,
    })
    const err = (operation: string) => (cause: RepositoryErrorCause) =>
      new PoliciesRepoError({ operation, cause })
    const one =
      <A>(operation: string) =>
      (row: Option.Option<A>) =>
        Option.match(row, {
          onNone: () =>
            Effect.fail(
              new PoliciesRepoError({
                operation,
                cause: new UnexpectedRowCount({ expected: 1, actual: 0 }),
              }),
            ),
          onSome: Effect.succeed,
        })
    return {
      list: (repositoryId) =>
        list({ repositoryId }).pipe(Effect.mapError(err("List"))),
      find: (repositoryId, policyId) =>
        find({ repositoryId, policyId }).pipe(Effect.mapError(err("Find"))),
      findDraft: (policyId) =>
        draft({ policyId }).pipe(Effect.mapError(err("FindDraft"))),
      findVersion: (versionId) =>
        version({ versionId }).pipe(Effect.mapError(err("FindVersion"))),
      findCurrentVersion: (policyId) =>
        currentVersion({ policyId }).pipe(
          Effect.mapError(err("FindCurrentVersion")),
        ),
      findVersionByHash: (policyId, contentHash) =>
        versionByHash({ policyId, contentHash }).pipe(
          Effect.mapError(err("FindVersionByHash")),
        ),
      listVersions: (policyId) =>
        versions({ policyId }).pipe(Effect.mapError(err("ListVersions"))),
      insertPolicy: (input) =>
        insertPolicy(input).pipe(
          Effect.mapError(err("InsertPolicy")),
          Effect.flatMap(one("InsertPolicy")),
        ),
      insertDraft: (input) =>
        insertDraft(input).pipe(
          Effect.mapError(err("InsertDraft")),
          Effect.flatMap(one("InsertDraft")),
        ),
      updateDraft: (policyId, expectedVersion, program, metadata) =>
        updateDraft({ policyId, expectedVersion, program, metadata }).pipe(
          Effect.mapError(err("UpdateDraft")),
          Effect.flatMap(one("UpdateDraft")),
        ),
      updatePolicy: (policyId, expectedVersion, name) =>
        updatePolicy({ policyId, expectedVersion, name }).pipe(
          Effect.mapError(err("UpdatePolicy")),
          Effect.flatMap(one("UpdatePolicy")),
        ),
      usage: (repositoryId, policyId) =>
        usage({ repositoryId, policyId }).pipe(
          Effect.mapError(err("Usage")),
          Effect.flatMap(one("Usage")),
        ),
      remove: (repositoryId, policyId, expectedVersion) =>
        remove({ repositoryId, policyId, expectedVersion }).pipe(
          Effect.mapError(err("Remove")),
          Effect.flatMap(one("Remove")),
          Effect.asVoid,
        ),
      insertVersion: (input) =>
        insertVersion(input).pipe(
          Effect.mapError(err("InsertVersion")),
          Effect.flatMap(one("InsertVersion")),
        ),
      insertDependencies: (versionId, repositoryId, dependencies) =>
        Effect.forEach(
          dependencies,
          (dependency) =>
            sql`INSERT OR IGNORE INTO labeling_policy_dependencies (policy_version_id,dependency_version_id,repository_id)
                SELECT ${versionId},current.published_version_id,${repositoryId}
                FROM labeling_policies AS current
                LEFT JOIN labeling_policy_versions AS legacy ON legacy.id=${dependency}
                WHERE (current.id=${dependency} OR legacy.policy_id=current.id)
                  AND current.repository_id=${repositoryId}`,
          { discard: true },
        ).pipe(Effect.mapError(err("InsertDependencies"))),
      insertTriggers: (versionId, repositoryId, triggers) =>
        Effect.forEach(
          triggers,
          (trigger) => {
            const separator = trigger.indexOf(":")
            return sql`INSERT OR IGNORE INTO labeling_policy_triggers (policy_version_id,repository_id,event,action) VALUES (${versionId},${repositoryId},${trigger.slice(0, separator)},${trigger.slice(separator + 1)})`
          },
          { discard: true },
        ).pipe(Effect.mapError(err("InsertTriggers"))),
      setCurrentVersion: (policyId, expectedVersion, versionId) =>
        publish({ policyId, expectedVersion, versionId }).pipe(
          Effect.mapError(err("SetCurrentVersion")),
          Effect.flatMap(one("SetCurrentVersion")),
        ),
      activateVersion: (versionId, repositoryId) =>
        activateVersion({ versionId, repositoryId }).pipe(
          Effect.mapError(err("ActivateVersion")),
          Effect.flatMap(one("ActivateVersion")),
        ),
      discardStagedVersions: (policyId) =>
        discardStagedVersions({ policyId }).pipe(
          Effect.mapError(err("DiscardStagedVersions")),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
