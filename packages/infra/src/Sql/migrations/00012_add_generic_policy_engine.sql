CREATE TABLE "labeling_policies" (
  "id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  "name" TEXT NOT NULL CHECK (length("name") BETWEEN 1 AND 100),
  "target" TEXT NOT NULL CHECK ("target" IN ('pull_request','issue')),
  "published_version_id" TEXT,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  "deleted_at" INTEGER,
  PRIMARY KEY ("id"),
  UNIQUE ("id","repository_id"),
  UNIQUE ("published_version_id","id","repository_id"),
  FOREIGN KEY ("repository_id") REFERENCES "github_repositories"("id") ON DELETE CASCADE,
  FOREIGN KEY ("published_version_id","id","repository_id")
    REFERENCES "labeling_policy_versions"("id","policy_id","repository_id")
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "labeling_policy_versions" (
  "id" TEXT NOT NULL,
  "policy_id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "program" TEXT NOT NULL CHECK (json_valid("program")),
  "content_hash" TEXT NOT NULL,
  "registry_manifest" TEXT NOT NULL CHECK (json_valid("registry_manifest")),
  "trigger_manifest" TEXT NOT NULL CHECK (json_valid("trigger_manifest")),
  "publication_status" TEXT NOT NULL CHECK ("publication_status" IN ('staged','published')),
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  PRIMARY KEY ("id"),
  UNIQUE ("id","policy_id","repository_id"),
  UNIQUE ("id","repository_id"),
  UNIQUE ("policy_id","revision"),
  UNIQUE ("policy_id","content_hash"),
  FOREIGN KEY ("policy_id","repository_id") REFERENCES "labeling_policies"("id","repository_id") ON DELETE CASCADE
);
CREATE INDEX "labeling_policy_versions_policy_created" ON "labeling_policy_versions"("policy_id","created_at");
CREATE TABLE "labeling_policy_drafts" (
  "policy_id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  "program" TEXT NOT NULL CHECK (json_valid("program")),
  "metadata" TEXT NOT NULL CHECK (json_valid("metadata")),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  "deleted_at" INTEGER,
  PRIMARY KEY ("policy_id"),
  FOREIGN KEY ("policy_id","repository_id") REFERENCES "labeling_policies"("id","repository_id") ON DELETE CASCADE
);
CREATE TABLE "labeling_policy_dependencies" (
  "policy_version_id" TEXT NOT NULL,
  "dependency_version_id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  PRIMARY KEY ("policy_version_id","dependency_version_id"),
  FOREIGN KEY ("policy_version_id","repository_id") REFERENCES "labeling_policy_versions"("id","repository_id") ON DELETE CASCADE,
  FOREIGN KEY ("dependency_version_id","repository_id") REFERENCES "labeling_policy_versions"("id","repository_id") ON DELETE RESTRICT
);
CREATE TRIGGER "labeling_policy_dependencies_immutable"
BEFORE UPDATE ON "labeling_policy_dependencies"
BEGIN SELECT RAISE(ABORT,'labeling policy dependencies are immutable'); END;
CREATE TABLE "labeling_policy_triggers" (
  "policy_version_id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  PRIMARY KEY ("policy_version_id","event","action"),
  FOREIGN KEY ("policy_version_id","repository_id") REFERENCES "labeling_policy_versions"("id","repository_id") ON DELETE CASCADE
);
CREATE INDEX "labeling_policy_triggers_event_action" ON "labeling_policy_triggers"("event","action","repository_id");
CREATE TRIGGER "labeling_policy_triggers_immutable"
BEFORE UPDATE ON "labeling_policy_triggers"
BEGIN SELECT RAISE(ABORT,'labeling policy triggers are immutable'); END;

INSERT INTO "labeling_policies" ("id","repository_id","name","target","version","created_at","updated_at")
SELECT 'policy:ready:'||"repository_id","repository_id",'Ready for review','pull_request',1,min("created_at"),max("updated_at")
FROM "labeling_rules" WHERE "kind"='ready-for-review' GROUP BY "repository_id";
INSERT INTO "labeling_policies" ("id","repository_id","name","target","version","created_at","updated_at")
SELECT 'policy:ai-gate:'||"repository_id","repository_id",'Not generated release','pull_request',1,min("created_at"),max("updated_at")
FROM "labeling_rules" WHERE "kind"='ai' GROUP BY "repository_id";

INSERT INTO "labeling_policy_versions" ("id","policy_id","repository_id","revision","program","content_hash","registry_manifest","trigger_manifest","publication_status","created_at")
SELECT 'policy-version:ready:'||"repository_id",'policy:ready:'||"repository_id","repository_id",1,
  '{"target":"pull_request","appliesWhen":{"_tag":"Not","id":"not-generated-release","condition":{"_tag":"All","id":"generated-release","conditions":[{"_tag":"Any","id":"release-title","conditions":[{"_tag":"FactPredicate","id":"release-title-plain","fact":"pull_request.title","operator":"Equals","value":"Version Packages"},{"_tag":"FactPredicate","id":"release-title-group","fact":"pull_request.title","operator":"MatchesGlob","value":"Version Packages (*)"}]},{"_tag":"FactPredicate","id":"release-body-action","fact":"pull_request.body","operator":"Contains","value":"[Changesets release](https://github.com/changesets/action) GitHub action"},{"_tag":"FactPredicate","id":"release-body-heading","fact":"pull_request.body","operator":"Contains","value":"# Releases"},{"_tag":"CollectionPredicate","id":"release-files","fact":"pull_request.changed_files","quantifier":"All","item":{"_tag":"Any","predicates":[{"_tag":"Predicate","field":"path","operator":"Equals","value":".changeset/pre.json"},{"_tag":"Predicate","field":"path","operator":"MatchesGlob","value":"packages/*/CHANGELOG.md"},{"_tag":"Predicate","field":"path","operator":"MatchesGlob","value":"packages/*/package.json"}]}}]}},"matchesWhen":{"_tag":"All","id":"ready","conditions":[{"_tag":"FactPredicate","id":"not-draft","fact":"pull_request.draft","operator":"Equals","value":false},{"_tag":"CollectionPredicate","id":"valid-changeset","fact":"pull_request.changed_files","quantifier":"Any","item":{"_tag":"All","predicates":[{"_tag":"Predicate","field":"status","operator":"Equals","value":"added"},{"_tag":"Predicate","field":"path","operator":"MatchesGlob","value":".changeset/*.md"},{"_tag":"Predicate","field":"path","operator":"NotEquals","value":".changeset/README.md"},{"_tag":"Predicate","field":"content","operator":"ValidChangesetDocument"}]}},{"_tag":"CollectionPredicate","id":"checks-pass","fact":"pull_request.required_checks","quantifier":"All","item":{"_tag":"Any","predicates":[{"_tag":"Predicate","field":"producer","operator":"Equals","value":"slopcop"},{"_tag":"Predicate","field":"state","operator":"In","value":["success","neutral","skipped"]}]}},{"_tag":"CollectionPredicate","id":"reviews-clear","fact":"pull_request.latest_reviews","quantifier":"None","item":{"_tag":"Predicate","field":"state","operator":"Equals","value":"CHANGES_REQUESTED"}}]}}',
  'generic-ready-v2',
  json_array('pull_request.draft','pull_request.title','pull_request.body','pull_request.changed_files','pull_request.changed_files.content','pull_request.required_checks','pull_request.latest_reviews'),
  json_array('pull_request:opened','pull_request:reopened','pull_request:synchronize','pull_request:edited','pull_request:ready_for_review','pull_request:converted_to_draft','pull_request:labeled','pull_request:unlabeled','check_run:created','check_run:rerequested','check_run:completed','check_suite:requested','check_suite:rerequested','check_suite:completed','status:*','pull_request_review:submitted','pull_request_review:dismissed'),
  'published',min("created_at")
FROM "labeling_rules" WHERE "kind"='ready-for-review' GROUP BY "repository_id";

CREATE TABLE "legacy_generated_release_guard" ("program" TEXT NOT NULL);
INSERT INTO "legacy_generated_release_guard" VALUES (json_object(
  '_tag','Not','condition',json_object(
    '_tag','All','conditions',json_array(
      json_object('_tag','Any','conditions',json_array(
        json_object('_tag','FactPredicate','fact','pull_request.title','operator','Equals','value','Version Packages'),
        json_object('_tag','FactPredicate','fact','pull_request.title','operator','MatchesGlob','value','Version Packages (*)')
      )),
      json_object('_tag','FactPredicate','fact','pull_request.body','operator','Contains','value','[Changesets release](https://github.com/changesets/action) GitHub action'),
      json_object('_tag','FactPredicate','fact','pull_request.body','operator','Contains','value','# Releases'),
      json_object('_tag','CollectionPredicate','fact','pull_request.changed_files','quantifier','Any','item',
        json_object('_tag','Predicate','field','path','operator','NotEmpty')),
      json_object('_tag','CollectionPredicate','fact','pull_request.changed_files','quantifier','All','item',json_object(
        '_tag','Any','predicates',json_array(
          json_object('_tag','Predicate','field','path','operator','Equals','value','.changeset/pre.json'),
          json_object('_tag','Predicate','field','path','operator','MatchesGlob','value','packages/*/CHANGELOG.md'),
          json_object('_tag','Predicate','field','path','operator','MatchesGlob','value','packages/*/package.json')
        )
      ))
    )
  )
));
INSERT INTO "labeling_policy_versions" ("id","policy_id","repository_id","revision","program","content_hash","registry_manifest","trigger_manifest","publication_status","created_at")
SELECT 'policy-version:ai-gate:'||"repository_id",'policy:ai-gate:'||"repository_id","repository_id",1,
  json_object('target','pull_request','appliesWhen',NULL,'matchesWhen',json((SELECT "program" FROM "legacy_generated_release_guard"))),
  'legacy-not-generated-release-v1',
  json_array('pull_request.title','pull_request.body','pull_request.changed_files'),
  json_array('pull_request:opened','pull_request:reopened','pull_request:synchronize','pull_request:edited','pull_request:ready_for_review','pull_request:converted_to_draft','pull_request:labeled','pull_request:unlabeled'),
  'published',min("created_at")
FROM "labeling_rules" WHERE "kind"='ai' GROUP BY "repository_id";
UPDATE "labeling_policy_versions"
SET "program"=json_set("program",'$.appliesWhen',json((SELECT "program" FROM "legacy_generated_release_guard"))),
    "content_hash"='generic-ready-v3'
WHERE "id" LIKE 'policy-version:ready:%';
UPDATE "labeling_policy_versions"
SET "program"=json_remove(
  "program",
  '$.matchesWhen.id',
  '$.matchesWhen.conditions[0].id',
  '$.matchesWhen.conditions[1].id',
  '$.matchesWhen.conditions[2].id',
  '$.matchesWhen.conditions[3].id'
)
WHERE "id" LIKE 'policy-version:ready:%';
DROP TABLE "legacy_generated_release_guard";

UPDATE "labeling_policies"
SET "published_version_id"=CASE
  WHEN "id" LIKE 'policy:ready:%' THEN 'policy-version:ready:'||"repository_id"
  ELSE 'policy-version:ai-gate:'||"repository_id" END;
INSERT INTO "labeling_policy_drafts" ("policy_id","repository_id","program","metadata","version","created_at","updated_at")
SELECT "policy_id","repository_id","program",'{}',1,"created_at","created_at" FROM "labeling_policy_versions";
INSERT INTO "labeling_policy_triggers" ("policy_version_id","repository_id","event","action")
SELECT versions."id",versions."repository_id",substr(value,1,instr(value,':')-1),substr(value,instr(value,':')+1)
FROM "labeling_policy_versions" AS versions,json_each(versions."trigger_manifest");
CREATE TRIGGER "labeling_policy_current_pointer_valid"
BEFORE UPDATE OF "published_version_id" ON "labeling_policies"
WHEN NEW."published_version_id" IS NULL OR NOT EXISTS (
  SELECT 1 FROM "labeling_policy_versions"
  WHERE "id"=NEW."published_version_id" AND "policy_id"=NEW."id"
    AND "repository_id"=NEW."repository_id" AND "publication_status"='published'
)
BEGIN SELECT RAISE(ABORT,'policy current version is invalid'); END;
CREATE TRIGGER "labeling_policy_versions_immutable"
BEFORE UPDATE ON "labeling_policy_versions"
WHEN NOT (
  OLD."publication_status"='staged' AND NEW."publication_status"='published'
  AND OLD."id"=NEW."id" AND OLD."policy_id"=NEW."policy_id"
  AND OLD."repository_id"=NEW."repository_id" AND OLD."revision"=NEW."revision"
  AND OLD."program"=NEW."program" AND OLD."content_hash"=NEW."content_hash"
  AND OLD."registry_manifest"=NEW."registry_manifest"
  AND OLD."trigger_manifest"=NEW."trigger_manifest" AND OLD."created_at"=NEW."created_at"
)
BEGIN SELECT RAISE(ABORT,'labeling policy versions are immutable'); END;
CREATE TRIGGER "labeling_policy_versions_published_delete"
BEFORE DELETE ON "labeling_policy_versions"
WHEN OLD."publication_status"='published'
  AND EXISTS (SELECT 1 FROM "labeling_policies" WHERE "id"=OLD."policy_id")
BEGIN SELECT RAISE(ABORT,'published labeling policy versions cannot be deleted'); END;
CREATE TRIGGER "labeling_policy_current_changed"
AFTER UPDATE OF "published_version_id" ON "labeling_policies"
WHEN NEW."published_version_id" IS NOT OLD."published_version_id"
BEGIN
  UPDATE "github_repositories" SET "rules_revision"="rules_revision"+1,"updated_at"=unixepoch()*1000
  WHERE "id"=NEW."repository_id";
END;
CREATE TRIGGER "labeling_policy_deleted"
AFTER UPDATE OF "deleted_at" ON "labeling_policies"
WHEN OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL
BEGIN
  UPDATE "labeling_policy_drafts" SET "deleted_at"=NEW."deleted_at",
    "updated_at"=unixepoch()*1000 WHERE "policy_id"=NEW."id";
  UPDATE "github_repositories" SET "rules_revision"="rules_revision"+1,
    "updated_at"=unixepoch()*1000 WHERE "id"=NEW."repository_id";
END;
CREATE TRIGGER "labeling_policy_dependencies_current_insert"
BEFORE INSERT ON "labeling_policy_dependencies"
WHEN EXISTS (SELECT 1 FROM "labeling_policy_versions" WHERE "id"=NEW."policy_version_id" AND "publication_status"='published')
BEGIN SELECT RAISE(ABORT,'current policy dependencies are immutable'); END;
CREATE TRIGGER "labeling_policy_dependencies_current_delete"
BEFORE DELETE ON "labeling_policy_dependencies"
WHEN EXISTS (SELECT 1 FROM "labeling_policy_versions" WHERE "id"=OLD."policy_version_id" AND "publication_status"='published')
BEGIN SELECT RAISE(ABORT,'current policy dependencies are immutable'); END;
CREATE TRIGGER "labeling_policy_triggers_current_insert"
BEFORE INSERT ON "labeling_policy_triggers"
WHEN EXISTS (SELECT 1 FROM "labeling_policy_versions" WHERE "id"=NEW."policy_version_id" AND "publication_status"='published')
BEGIN SELECT RAISE(ABORT,'current policy triggers are immutable'); END;
CREATE TRIGGER "labeling_policy_triggers_current_delete"
BEFORE DELETE ON "labeling_policy_triggers"
WHEN EXISTS (SELECT 1 FROM "labeling_policy_versions" WHERE "id"=OLD."policy_version_id" AND "publication_status"='published')
BEGIN SELECT RAISE(ABORT,'current policy triggers are immutable'); END;

CREATE TABLE "labeling_rules_new" (
  "id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  "_tag" TEXT NOT NULL CHECK ("_tag" IN ('PolicyLabelingRule','AiLabelingRule')),
  "policy_id" TEXT,
  "prompt" TEXT,
  "evidence" TEXT,
  "minimum_confidence" REAL,
  "evaluator" TEXT,
  "gate_policy_id" TEXT,
  "label" TEXT NOT NULL CHECK (length("label") BETWEEN 1 AND 50),
  "on_match" TEXT NOT NULL CHECK ("on_match"='ensure-present'),
  "on_no_match" TEXT NOT NULL CHECK ("on_no_match" IN ('ensure-absent','preserve')),
  "conflict_group" TEXT CHECK ("conflict_group" IS NULL OR length("conflict_group") BETWEEN 1 AND 100),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" INTEGER NOT NULL CHECK ("enabled" IN (0,1)),
  "validation_status" TEXT NOT NULL CHECK ("validation_status" IN ('valid','missing','unknown')),
  "validated_at" INTEGER,
  "version" INTEGER NOT NULL CHECK ("version">0),
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  "deleted_at" INTEGER,
  PRIMARY KEY ("id"),
  UNIQUE ("id","repository_id"),
  FOREIGN KEY ("repository_id") REFERENCES "github_repositories"("id") ON DELETE CASCADE,
  FOREIGN KEY ("policy_id","repository_id") REFERENCES "labeling_policies"("id","repository_id") ON DELETE RESTRICT,
  FOREIGN KEY ("gate_policy_id","repository_id") REFERENCES "labeling_policies"("id","repository_id") ON DELETE RESTRICT,
  CHECK (NOT "enabled" OR "validation_status"='valid'),
  CHECK (
    ("_tag"='PolicyLabelingRule' AND "policy_id" IS NOT NULL
      AND "prompt" IS NULL AND "evidence" IS NULL
      AND "minimum_confidence" IS NULL AND "evaluator" IS NULL
      AND "gate_policy_id" IS NULL)
    OR
    ("_tag"='AiLabelingRule' AND "policy_id" IS NULL
      AND length("prompt") BETWEEN 1 AND 4000
      AND json_valid("evidence") AND json_type("evidence")='array'
      AND json_array_length("evidence") BETWEEN 1 AND 8
      AND "minimum_confidence" BETWEEN 0 AND 1
      AND "evaluator"='boolean-policy-v1')
  )
);
INSERT INTO "labeling_rules_new"
SELECT "id","repository_id",
  CASE WHEN "kind"='ai' THEN 'AiLabelingRule' ELSE 'PolicyLabelingRule' END,
  CASE WHEN "kind"='ai' THEN NULL ELSE 'policy:ready:'||"repository_id" END,
  CASE WHEN "kind"='ai' THEN "instructions" ELSE NULL END,
  CASE WHEN "kind"='ai' THEN json_array('pull_request.title','pull_request.body','pull_request.base_ref','pull_request.changed_files') ELSE NULL END,
  CASE WHEN "kind"='ai' THEN "confidence_threshold" ELSE NULL END,
  CASE WHEN "kind"='ai' THEN 'boolean-policy-v1' ELSE NULL END,
  CASE WHEN "kind"='ai' THEN 'policy:ai-gate:'||"repository_id" ELSE NULL END,
  "label",'ensure-present',CASE WHEN "mode"='reconcile' THEN 'ensure-absent' ELSE 'preserve' END,
  "exclusive_group",0,"enabled","validation_status","validated_at","version","created_at","updated_at","deleted_at"
FROM "labeling_rules";

CREATE TABLE "labeling_rule_audit_log_new" (
  "id" TEXT PRIMARY KEY,
  "repository_id" TEXT NOT NULL,
  "rule_id" TEXT,
  "actor" TEXT NOT NULL,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('create','update','validate','disable','delete')),
  "before" TEXT CHECK ("before" IS NULL OR json_valid("before")),
  "after" TEXT CHECK ("after" IS NULL OR json_valid("after")),
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  "deleted_at" INTEGER,
  FOREIGN KEY ("repository_id") REFERENCES "github_repositories"("id") ON DELETE CASCADE,
  FOREIGN KEY ("rule_id","repository_id") REFERENCES "labeling_rules_new"("id","repository_id")
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
INSERT INTO "labeling_rule_audit_log_new" SELECT * FROM "labeling_rule_audit_log";
DROP TABLE "labeling_rule_audit_log";
DROP TABLE "labeling_rules";
ALTER TABLE "labeling_rules_new" RENAME TO "labeling_rules";
ALTER TABLE "labeling_rule_audit_log_new" RENAME TO "labeling_rule_audit_log";
CREATE UNIQUE INDEX "labeling_rules_repository_label_unique" ON "labeling_rules"("repository_id",lower("label")) WHERE "deleted_at" IS NULL;
CREATE INDEX "labeling_rules_policy" ON "labeling_rules"("policy_id","repository_id");
CREATE INDEX "labeling_rules_stale_enabled" ON "labeling_rules"("enabled","validation_status","validated_at");
CREATE INDEX "labeling_rule_audit_log_repository_created_at" ON "labeling_rule_audit_log"("repository_id","created_at");
CREATE INDEX "labeling_rule_audit_log_rule_id" ON "labeling_rule_audit_log"("rule_id");
CREATE TRIGGER "labeling_rule_audit_log_immutable_update"
BEFORE UPDATE ON "labeling_rule_audit_log"
BEGIN SELECT RAISE(ABORT,'labeling rule audit entries are immutable'); END;
CREATE TRIGGER "labeling_rule_audit_log_immutable_delete"
BEFORE DELETE ON "labeling_rule_audit_log"
WHEN EXISTS (SELECT 1 FROM "github_repositories" WHERE "id"=OLD."repository_id")
BEGIN SELECT RAISE(ABORT,'labeling rule audit entries are immutable'); END;

CREATE TABLE "policy_evaluations" (
  "id" TEXT NOT NULL,
  "delivery_id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  "_tag" TEXT NOT NULL CHECK ("_tag" IN ('PolicyRuleEvaluation','AiRuleEvaluation')),
  "rule_id" TEXT NOT NULL,
  "rule_version" INTEGER NOT NULL CHECK ("rule_version">0),
  "policy_id" TEXT,
  "policy_version_id" TEXT,
  "evaluator" TEXT,
  "gate_policy_id" TEXT,
  "gate_policy_version_id" TEXT,
  "target" TEXT NOT NULL CHECK ("target" IN ('pull_request','issue')),
  "subject_number" INTEGER NOT NULL CHECK ("subject_number">0),
  "head_sha" TEXT,
  "subject_generation" TEXT GENERATED ALWAYS AS (coalesce("head_sha",'')) STORED,
  "automation_revision" INTEGER NOT NULL CHECK ("automation_revision">=0),
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('Match','NoMatch','Abstain','Error')),
  "confidence" REAL NOT NULL CHECK ("confidence" BETWEEN 0 AND 1),
  "rationale" TEXT NOT NULL,
  "trace" TEXT CHECK ("trace" IS NULL OR json_valid("trace")),
  "gate_trace" TEXT CHECK ("gate_trace" IS NULL OR json_valid("gate_trace")),
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  CHECK (
    ("_tag"='PolicyRuleEvaluation' AND "policy_id" IS NOT NULL AND "policy_version_id" IS NOT NULL
      AND "trace" IS NOT NULL AND "evaluator" IS NULL AND "gate_policy_id" IS NULL
      AND "gate_policy_version_id" IS NULL AND "gate_trace" IS NULL)
    OR
    ("_tag"='AiRuleEvaluation' AND "policy_id" IS NULL AND "policy_version_id" IS NULL
      AND "trace" IS NULL AND "evaluator"='boolean-policy-v1'
      AND (("gate_policy_id" IS NULL AND "gate_policy_version_id" IS NULL AND "gate_trace"='null')
        OR ("gate_policy_id" IS NOT NULL AND "gate_policy_version_id" IS NOT NULL)))
  ),
  PRIMARY KEY ("id"),
  UNIQUE ("id","repository_id"),
  UNIQUE ("delivery_id","rule_id","rule_version","subject_number","subject_generation"),
  FOREIGN KEY ("repository_id") REFERENCES "github_repositories"("id") ON DELETE CASCADE,
  FOREIGN KEY ("rule_id","repository_id") REFERENCES "labeling_rules"("id","repository_id") ON DELETE RESTRICT,
  FOREIGN KEY ("policy_id","repository_id") REFERENCES "labeling_policies"("id","repository_id") ON DELETE RESTRICT,
  FOREIGN KEY ("policy_version_id","policy_id","repository_id") REFERENCES "labeling_policy_versions"("id","policy_id","repository_id") ON DELETE RESTRICT,
  FOREIGN KEY ("gate_policy_id","repository_id") REFERENCES "labeling_policies"("id","repository_id") ON DELETE RESTRICT,
  FOREIGN KEY ("gate_policy_version_id","gate_policy_id","repository_id") REFERENCES "labeling_policy_versions"("id","policy_id","repository_id") ON DELETE RESTRICT
);
CREATE INDEX "policy_evaluations_rule_subject" ON "policy_evaluations"("rule_id","subject_number","created_at");
CREATE TABLE "policy_action_executions" (
  "id" TEXT PRIMARY KEY,
  "evaluation_id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('add','remove','preserve')),
  "label" TEXT NOT NULL,
  "selected" INTEGER NOT NULL CHECK ("selected" IN (0,1)),
  "status" TEXT NOT NULL CHECK ("status" IN ('planned','completed')),
  "applied" INTEGER NOT NULL CHECK ("applied" IN (0,1)),
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  UNIQUE ("evaluation_id","rule_id"),
  FOREIGN KEY ("evaluation_id","repository_id") REFERENCES "policy_evaluations"("id","repository_id") ON DELETE CASCADE,
  FOREIGN KEY ("rule_id","repository_id") REFERENCES "labeling_rules"("id","repository_id") ON DELETE RESTRICT
);
