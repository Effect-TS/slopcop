import { readFileSync, readdirSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vite-plus/test"

const directory = new URL("../src/Sql/migrations/", import.meta.url)
const migrations = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
const apply = (database: DatabaseSync, names: ReadonlyArray<string>) => {
  names.forEach((name) =>
    database.exec(readFileSync(new URL(name, directory), "utf8")),
  )
}
const repositoryId = "019be000-0000-7000-8000-000000000001"
const insertRepository = (database: DatabaseSync) =>
  database.exec(`
    INSERT INTO github_repositories (
      id,github_id,owner,repo,installation_id,enabled,rules_revision
    ) VALUES (
      '${repositoryId}','test-repository','Test','repository','1',1,0
    );
  `)
const insertLegacyAiRule = (database: DatabaseSync) =>
  database.exec(`
    INSERT INTO labeling_rules (
      id,repository_id,name,label,instructions,confidence_threshold,mode,
      exclusive_group,enabled,validation_status,validated_at,version,kind,
      created_at,updated_at
    ) VALUES (
      '019be000-0000-7000-8000-000000000005','${repositoryId}',
      'Bug fixes','bug',
      'Apply when the primary purpose is to correct behavior that is incorrect, unintended, silently ignored, regressed, or improperly validated. This includes adding validation or an error path that makes existing behavior conform to its intended contract. Prefer bug over enhancement when corrective work also adds implementation logic.',
      0.75,'add-only','change-kind',1,'valid',100,1,'ai',100,200
    );
  `)

describe("00012 generic policy engine migration", () => {
  it("applies the fresh migration chain with valid foreign keys", () => {
    const database = new DatabaseSync(":memory:")
    database.exec("PRAGMA foreign_keys=ON")
    apply(database, migrations)
    expect(migrations).toContain("00012_add_generic_policy_engine.sql")
    expect(migrations).not.toContain("00006_seed_effect_labeling.sql")
    expect(
      database
        .prepare("SELECT count(*) AS count FROM github_repositories")
        .get(),
    ).toEqual({ count: 0 })
    expect(
      database.prepare("SELECT count(*) AS count FROM labeling_rules").get(),
    ).toEqual({ count: 0 })
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='github_events'",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    database.close()
  })

  it("retains explicit audit constraints and indexes", () => {
    const database = new DatabaseSync(":memory:")
    database.exec("PRAGMA foreign_keys=ON")
    apply(database, migrations)
    expect(() =>
      database.exec(`
        INSERT INTO labeling_rule_audit_log (
          id,repository_id,rule_id,actor,operation,before,after
        ) VALUES (
          'bad-audit','019be000-0000-7000-8000-000000000001',NULL,
          'admin:test','invalid','not-json',NULL
        );
      `),
    ).toThrow()
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM pragma_index_list('labeling_rule_audit_log') WHERE name IN ('labeling_rule_audit_log_repository_created_at','labeling_rule_audit_log_rule_id')",
        )
        .get(),
    ).toEqual({ count: 2 })
    database.close()
  })

  it("cascades unpublished policy staging data without immutable-delete blockers", () => {
    const database = new DatabaseSync(":memory:")
    database.exec("PRAGMA foreign_keys=ON")
    apply(database, migrations)
    insertRepository(database)
    database.exec(`
      INSERT INTO labeling_policies (
        id,repository_id,name,target,published_version_id,version
      ) VALUES (
        'staged-policy','${repositoryId}',
        'Staged','pull_request',NULL,1
      );
      INSERT INTO labeling_policy_versions (
        id,policy_id,repository_id,revision,program,content_hash,
        registry_manifest,trigger_manifest,publication_status
      ) VALUES (
        'staged-version','staged-policy','${repositoryId}',
        1,'{"target":"pull_request","appliesWhen":null,"matchesWhen":{"_tag":"FactPredicate","fact":"pull_request.draft","operator":"Equals","value":false}}',
        'staged-hash','["pull_request.draft"]','["pull_request:opened"]','staged'
      );
      INSERT INTO labeling_policy_drafts (
        policy_id,repository_id,program,metadata,version
      ) SELECT policy_id,repository_id,program,'{}',1
        FROM labeling_policy_versions WHERE id='staged-version';
      INSERT INTO labeling_policy_triggers (
        policy_version_id,repository_id,event,action
      ) VALUES (
        'staged-version','${repositoryId}',
        'pull_request','opened'
      );
      DELETE FROM labeling_policies WHERE id='staged-policy';
    `)
    expect(
      database
        .prepare(
          "SELECT (SELECT count(*) FROM labeling_policy_versions WHERE policy_id='staged-policy') + (SELECT count(*) FROM labeling_policy_drafts WHERE policy_id='staged-policy') + (SELECT count(*) FROM labeling_policy_triggers WHERE policy_version_id='staged-version') AS count",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    database.close()
  })

  it("allows repository cascades through published immutable data", () => {
    const database = new DatabaseSync(":memory:")
    database.exec("PRAGMA foreign_keys=ON")
    apply(database, migrations)
    insertRepository(database)
    database.exec(`
      INSERT INTO labeling_policies (id,repository_id,name,target,version)
      VALUES ('published-policy','${repositoryId}','Published','pull_request',1);
      INSERT INTO labeling_policy_versions (
        id,policy_id,repository_id,revision,program,content_hash,
        registry_manifest,trigger_manifest,publication_status
      ) VALUES (
        'published-version','published-policy','${repositoryId}',1,
        '{"target":"pull_request","appliesWhen":null,"matchesWhen":{"_tag":"FactPredicate","fact":"pull_request.draft","operator":"Equals","value":false}}',
        'published-hash','["pull_request.draft"]','["pull_request:opened"]','staged'
      );
      INSERT INTO labeling_policy_drafts (policy_id,repository_id,program,metadata,version)
      SELECT policy_id,repository_id,program,'{}',1 FROM labeling_policy_versions
      WHERE id='published-version';
      INSERT INTO labeling_policy_triggers (policy_version_id,repository_id,event,action)
      VALUES ('published-version','${repositoryId}','pull_request','opened');
      UPDATE labeling_policy_versions SET publication_status='published'
      WHERE id='published-version';
      UPDATE labeling_policies SET published_version_id='published-version',version=2
      WHERE id='published-policy';
    `)
    expect(() =>
      database.exec(
        `DELETE FROM github_repositories WHERE id='${repositoryId}'`,
      ),
    ).not.toThrow()
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    database.close()
  })

  it("activates before pointer publication and advances coherent state atomically", () => {
    const database = new DatabaseSync(":memory:")
    database.exec("PRAGMA foreign_keys=ON")
    apply(database, migrations)
    insertRepository(database)
    const before = database
      .prepare("SELECT rules_revision FROM github_repositories WHERE id=?")
      .get(repositoryId)
    const beforeRevision = Number(before?.rules_revision)
    database.exec(`
      INSERT INTO labeling_policies (id,repository_id,name,target,version)
      VALUES ('publish-policy','${repositoryId}','Publish','pull_request',1);
      INSERT INTO labeling_policy_versions (
        id,policy_id,repository_id,revision,program,content_hash,
        registry_manifest,trigger_manifest,publication_status
      ) VALUES (
        'publish-version','publish-policy','${repositoryId}',1,
        '{"target":"pull_request","appliesWhen":null,"matchesWhen":{"_tag":"FactPredicate","fact":"pull_request.draft","operator":"Equals","value":false}}',
        'publish-hash','["pull_request.draft"]','["pull_request:opened"]','staged'
      );
      INSERT INTO labeling_policy_drafts (policy_id,repository_id,program,metadata,version)
      SELECT policy_id,repository_id,program,'{}',1 FROM labeling_policy_versions
      WHERE id='publish-version';
      INSERT INTO labeling_policy_triggers (policy_version_id,repository_id,event,action)
      VALUES ('publish-version','${repositoryId}','pull_request','opened');
    `)
    expect(() =>
      database.exec(
        "UPDATE labeling_policies SET published_version_id='publish-version',version=version+1 WHERE id='publish-policy'",
      ),
    ).toThrow("policy current version is invalid")
    expect(
      database
        .prepare(
          "SELECT version,published_version_id FROM labeling_policies WHERE id='publish-policy'",
        )
        .get(),
    ).toEqual({ version: 1, published_version_id: null })
    database.exec(`
      UPDATE labeling_policy_versions SET publication_status='published'
      WHERE id='publish-version';
      UPDATE labeling_policies SET published_version_id='publish-version',version=version+1
      WHERE id='publish-policy' AND version=1;
    `)
    expect(
      database
        .prepare(
          `SELECT policy.version AS policy_version,draft.version AS draft_version,
             repository.rules_revision AS rules_revision
           FROM labeling_policies AS policy
           INNER JOIN labeling_policy_drafts AS draft ON draft.policy_id=policy.id
           INNER JOIN github_repositories AS repository ON repository.id=policy.repository_id
           WHERE policy.id='publish-policy'`,
        )
        .get(),
    ).toEqual({
      policy_version: 2,
      draft_version: 1,
      rules_revision: beforeRevision + 1,
    })
    expect(() =>
      database.exec(`
        INSERT INTO labeling_policy_triggers (policy_version_id,repository_id,event,action)
        VALUES ('publish-version','${repositoryId}','status','*');
      `),
    ).toThrow("current policy triggers are immutable")
    expect(() =>
      database.exec(
        "DELETE FROM labeling_policy_triggers WHERE policy_version_id='publish-version'",
      ),
    ).toThrow("current policy triggers are immutable")
    database.exec(
      "UPDATE labeling_policies SET deleted_at=1000 WHERE id='publish-policy'",
    )
    expect(
      database
        .prepare(
          `SELECT draft.deleted_at,repository.rules_revision
           FROM labeling_policy_drafts AS draft
           INNER JOIN github_repositories AS repository
             ON repository.id=draft.repository_id
           WHERE draft.policy_id='publish-policy'`,
        )
        .get(),
    ).toEqual({ deleted_at: 1000, rules_revision: beforeRevision + 2 })
    database.close()
  })

  it("converts legacy AI rules to first-class rules and readiness rules to policies", () => {
    const database = new DatabaseSync(":memory:")
    database.exec("PRAGMA foreign_keys=ON")
    apply(
      database,
      migrations.filter((name) => !name.startsWith("00012_")),
    )
    insertRepository(database)
    insertLegacyAiRule(database)
    database.exec(`
      INSERT INTO labeling_rules (
        id,repository_id,name,label,instructions,confidence_threshold,mode,
        exclusive_group,enabled,validation_status,validated_at,version,kind,
        created_at,updated_at
      ) VALUES
        ('ready-1','019be000-0000-7000-8000-000000000001','Ready','ready','Legacy',0.8,'reconcile',NULL,1,'valid',100,1,'ready-for-review',100,200),
        ('ready-2','019be000-0000-7000-8000-000000000001','Reviewed','reviewed','Legacy',0.8,'add-only',NULL,1,'valid',100,1,'ready-for-review',101,201);
      INSERT INTO labeling_decisions (
        id,delivery_id,repository_id,subject_type,subject_number,head_sha,
        rules_revision,selected_rule_ids,selected_labels,model,prompt_version,
        labels_added,labels_removed,created_at,updated_at
      ) VALUES (
        'legacy-decision','legacy-delivery','019be000-0000-7000-8000-000000000001',
        'pull_request',42,NULL,1,'["019be000-0000-7000-8000-000000000005"]',
        '["bug"]','legacy','3','["bug"]','[]',100,200
      );
      INSERT INTO labeling_rule_audit_log (
        id,repository_id,rule_id,actor,operation,before,after,created_at,updated_at
      ) VALUES (
        'legacy-audit','019be000-0000-7000-8000-000000000001',
        '019be000-0000-7000-8000-000000000005','admin:test','update',
        '{"id":"019be000-0000-7000-8000-000000000005","repositoryId":"019be000-0000-7000-8000-000000000001","label":"bug","enabled":true,"validationStatus":"valid","validatedAt":null,"version":1}',
        NULL,100,200
      );
    `)
    apply(database, ["00012_add_generic_policy_engine.sql"])

    expect(
      database
        .prepare(
          "SELECT _tag,policy_id,prompt,json_array_length(evidence) AS evidence_count,minimum_confidence,evaluator,gate_policy_id,on_no_match,conflict_group FROM labeling_rules WHERE id='019be000-0000-7000-8000-000000000005'",
        )
        .get(),
    ).toEqual({
      _tag: "AiLabelingRule",
      policy_id: null,
      prompt:
        "Apply when the primary purpose is to correct behavior that is incorrect, unintended, silently ignored, regressed, or improperly validated. This includes adding validation or an error path that makes existing behavior conform to its intended contract. Prefer bug over enhancement when corrective work also adds implementation logic.",
      evidence_count: 4,
      minimum_confidence: 0.75,
      evaluator: "boolean-policy-v1",
      gate_policy_id: "policy:ai-gate:019be000-0000-7000-8000-000000000001",
      on_no_match: "preserve",
      conflict_group: "change-kind",
    })
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM labeling_policies WHERE id='policy:019be000-0000-7000-8000-000000000005'",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(
      database
        .prepare(
          `SELECT policy.name,policy.published_version_id,
            version.publication_status,
            json_type(version.program,'$.appliesWhen') AS applies_when,
            json_extract(version.program,'$.matchesWhen._tag') AS matches_tag,
            json_array_length(version.registry_manifest) AS registry_facts,
            (SELECT count(*) FROM labeling_policy_drafts AS draft
              WHERE draft.policy_id=policy.id) AS drafts,
            (SELECT count(*) FROM labeling_policy_triggers AS trigger
              WHERE trigger.policy_version_id=version.id) AS triggers
          FROM labeling_policies AS policy
          INNER JOIN labeling_policy_versions AS version
            ON version.id=policy.published_version_id
          WHERE policy.id='policy:ai-gate:019be000-0000-7000-8000-000000000001'`,
        )
        .get(),
    ).toEqual({
      name: "Not generated release",
      published_version_id:
        "policy-version:ai-gate:019be000-0000-7000-8000-000000000001",
      publication_status: "published",
      applies_when: "null",
      matches_tag: "Not",
      registry_facts: 3,
      drafts: 1,
      triggers: 8,
    })
    expect(
      database
        .prepare(
          `SELECT count(*) AS gates
          FROM labeling_policies
          WHERE repository_id='019be000-0000-7000-8000-000000000001'
            AND name='Not generated release'`,
        )
        .get(),
    ).toEqual({ gates: 1 })
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM labeling_policy_versions,json_tree(program) WHERE json_tree.value='AiPrompt'",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(
      database
        .prepare(
          "SELECT count(DISTINCT policy_id) AS policies FROM labeling_rules WHERE id IN ('ready-1','ready-2')",
        )
        .get(),
    ).toEqual({ policies: 1 })
    expect(
      database
        .prepare(
          "SELECT json_extract(program,'$.matchesWhen._tag') AS tag FROM labeling_policy_versions WHERE id='policy-version:ready:019be000-0000-7000-8000-000000000001'",
        )
        .get(),
    ).toEqual({ tag: "All" })
    expect(
      database
        .prepare(
          `SELECT
            sum(value='ValidChangesetDocument') AS valid_changeset,
            sum(value='.changeset/README.md') AS excludes_readme,
            sum(value='slopcop') AS excludes_own_checks
          FROM labeling_policy_versions,json_tree(program)
          WHERE labeling_policy_versions.id='policy-version:ready:019be000-0000-7000-8000-000000000001'`,
        )
        .get(),
    ).toEqual({
      valid_changeset: 1,
      excludes_readme: 1,
      excludes_own_checks: 1,
    })
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM labeling_policy_versions,json_tree(program) WHERE labeling_policy_versions.id='policy-version:ready:019be000-0000-7000-8000-000000000001' AND json_tree.key='id'",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(() =>
      database.exec(
        "UPDATE labeling_policy_versions SET content_hash='changed' WHERE id='policy-version:ready:019be000-0000-7000-8000-000000000001'",
      ),
    ).toThrow("labeling policy versions are immutable")
    expect(
      database
        .prepare(
          "SELECT id,updated_at FROM labeling_decisions WHERE id='legacy-decision'",
        )
        .get(),
    ).toEqual({ id: "legacy-decision", updated_at: 200 })
    expect(
      database
        .prepare(
          "SELECT id,actor,operation FROM labeling_rule_audit_log WHERE id='legacy-audit'",
        )
        .get(),
    ).toEqual({ id: "legacy-audit", actor: "admin:test", operation: "update" })
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='labeling_rule_audit_log_rule_id'",
        )
        .get(),
    ).toEqual({ name: "labeling_rule_audit_log_rule_id" })

    database.exec(`
      INSERT INTO github_repositories (
        id,github_id,owner,repo,installation_id,enabled,rules_revision
      ) VALUES ('repo-2','repo-2','Other','repo','2',1,0);
    `)
    expect(() =>
      database.exec(`
        INSERT INTO labeling_rules (
          id,repository_id,_tag,policy_id,label,on_match,on_no_match,conflict_group,
          priority,enabled,validation_status,validated_at,version
        ) VALUES (
          'foreign-rule','repo-2','PolicyLabelingRule','policy:ready:019be000-0000-7000-8000-000000000001',
          'foreign','ensure-present','preserve',NULL,0,1,'valid',100,1
        );
      `),
    ).toThrow("FOREIGN KEY constraint failed")
    expect(() =>
      database.exec(`
        INSERT INTO labeling_rules (
          id,repository_id,_tag,policy_id,prompt,evidence,minimum_confidence,
          evaluator,gate_policy_id,label,on_match,on_no_match,conflict_group,
          priority,enabled,validation_status,validated_at,version
        ) VALUES (
          'mixed-rule','019be000-0000-7000-8000-000000000001',
          'PolicyLabelingRule','policy:ready:019be000-0000-7000-8000-000000000001',
          'Unexpected prompt','["pull_request.title"]',0.8,'boolean-policy-v1',NULL,
          'mixed','ensure-present','preserve',NULL,0,1,'valid',100,1
        );
      `),
    ).toThrow("CHECK constraint failed")
    expect(() =>
      database.exec(`
        INSERT INTO labeling_rule_audit_log (
          id,repository_id,rule_id,actor,operation,before,after
        ) VALUES (
          'foreign-audit','repo-2','019be000-0000-7000-8000-000000000005',
          'admin:test','validate',NULL,NULL
        );
      `),
    ).toThrow("FOREIGN KEY constraint failed")
    expect(() =>
      database.exec(
        "UPDATE labeling_rule_audit_log SET actor='changed' WHERE id='legacy-audit'",
      ),
    ).toThrow("labeling rule audit entries are immutable")
    expect(() =>
      database.exec(
        "DELETE FROM labeling_rule_audit_log WHERE id='legacy-audit'",
      ),
    ).toThrow("labeling rule audit entries are immutable")

    database.exec(`
       INSERT INTO policy_evaluations (
         id,delivery_id,repository_id,_tag,rule_id,rule_version,evaluator,
         target,subject_number,head_sha,automation_revision,outcome,confidence,
         rationale,gate_trace
       ) VALUES (
         'evaluation-1','evaluation-delivery','019be000-0000-7000-8000-000000000001',
         'AiRuleEvaluation','019be000-0000-7000-8000-000000000005',1,
         'boolean-policy-v1','pull_request',42,NULL,1,'Error',0,'failed','null'
       );
       INSERT INTO policy_evaluations (
         id,delivery_id,repository_id,_tag,rule_id,rule_version,evaluator,
         target,subject_number,head_sha,automation_revision,outcome,confidence,
         rationale,gate_trace
       ) VALUES (
         'evaluation-retry','evaluation-delivery','019be000-0000-7000-8000-000000000001',
         'AiRuleEvaluation','019be000-0000-7000-8000-000000000005',1,
         'boolean-policy-v1','pull_request',42,NULL,1,'Match',1,'retry succeeded','null'
       ) ON CONFLICT (delivery_id,rule_id,rule_version,subject_number,subject_generation)
       DO UPDATE SET outcome=excluded.outcome,confidence=excluded.confidence,
         rationale=excluded.rationale,gate_trace=excluded.gate_trace;
      INSERT INTO policy_action_executions (
        id,evaluation_id,repository_id,rule_id,action,label,selected,status,applied
      ) VALUES (
        'action-1','evaluation-1','019be000-0000-7000-8000-000000000001',
        '019be000-0000-7000-8000-000000000005','preserve','bug',1,'planned',0
      );
    `)
    expect(
      database
        .prepare(
          "SELECT id,outcome,confidence,rationale FROM policy_evaluations WHERE id='evaluation-1'",
        )
        .get(),
    ).toEqual({
      id: "evaluation-1",
      outcome: "Match",
      confidence: 1,
      rationale: "retry succeeded",
    })
    expect(
      database
        .prepare(
          "SELECT evaluation_id,selected,status,applied FROM policy_action_executions WHERE id='action-1'",
        )
        .get(),
    ).toEqual({
      evaluation_id: "evaluation-1",
      selected: 1,
      status: "planned",
      applied: 0,
    })
    expect(
      database
        .prepare(
          "SELECT delivery_id FROM policy_evaluations WHERE id='evaluation-1'",
        )
        .get(),
    ).toEqual({ delivery_id: "evaluation-delivery" })
    expect(() =>
      database.exec(`
         INSERT INTO policy_evaluations (
           id,delivery_id,repository_id,_tag,rule_id,rule_version,evaluator,
           target,subject_number,head_sha,automation_revision,outcome,confidence,
           rationale,gate_trace
         ) VALUES (
           'evaluation-2','evaluation-delivery','019be000-0000-7000-8000-000000000001',
           'AiRuleEvaluation','019be000-0000-7000-8000-000000000005',1,
           'boolean-policy-v1','pull_request',42,NULL,1,'Match',1,'test','null'
        );
      `),
    ).toThrow("UNIQUE constraint failed")
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    database.close()
  })
})
