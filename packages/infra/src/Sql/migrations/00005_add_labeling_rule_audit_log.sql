CREATE TABLE "labeling_rule_audit_log" (
  "id" TEXT PRIMARY KEY,
  "repository_id" TEXT NOT NULL,
  "rule_id" TEXT,
  "actor" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "before" TEXT
    CHECK ("before" IS NULL OR json_valid("before")),
  "after" TEXT
    CHECK ("after" IS NULL OR json_valid("after")),
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "deleted_at" INTEGER,
  CONSTRAINT "labeling_rule_audit_log_repository_id_fkey"
    FOREIGN KEY ("repository_id")
    REFERENCES "github_repositories" ("id")
    ON DELETE CASCADE,
  CONSTRAINT "labeling_rule_audit_log_rule_id_labeling_rules_id_fkey"
    FOREIGN KEY ("rule_id")
    REFERENCES "labeling_rules" ("id")
    ON DELETE SET NULL,
  CONSTRAINT "labeling_rule_audit_log_operation_valid"
    CHECK (
      "operation" IN ('create', 'update', 'validate', 'disable', 'delete')
    )
);

CREATE INDEX "labeling_rule_audit_log_repository_created_at"
  ON "labeling_rule_audit_log" ("repository_id", "created_at");

CREATE INDEX "labeling_rule_audit_log_rule_id"
  ON "labeling_rule_audit_log" ("rule_id");
