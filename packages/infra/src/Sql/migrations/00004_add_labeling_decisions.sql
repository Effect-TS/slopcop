CREATE TABLE "labeling_decisions" (
  "id" TEXT PRIMARY KEY,
  "delivery_id" TEXT NOT NULL,
  "repository_id" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_number" INTEGER NOT NULL,
  "head_sha" TEXT,
  "rules_revision" INTEGER NOT NULL,
  "selected_rule_ids" TEXT NOT NULL
    CHECK (json_valid("selected_rule_ids")),
  "selected_labels" TEXT NOT NULL
    CHECK (json_valid("selected_labels")),
  "model" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "labels_added" TEXT NOT NULL
    CHECK (json_valid("labels_added")),
  "labels_removed" TEXT NOT NULL
    CHECK (json_valid("labels_removed")),
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "deleted_at" INTEGER,
  CONSTRAINT "labeling_decisions_repository_id_github_repositories_id_fkey"
    FOREIGN KEY ("repository_id")
    REFERENCES "github_repositories" ("id"),
  CONSTRAINT "labeling_decisions_subject_type_valid"
    CHECK ("subject_type" IN ('pull_request', 'issue')),
  CONSTRAINT "labeling_decisions_subject_number_positive"
    CHECK ("subject_number" > 0),
  CONSTRAINT "labeling_decisions_rules_revision_nonnegative"
    CHECK ("rules_revision" >= 0)
);

CREATE INDEX "labeling_decisions_delivery_id"
  ON "labeling_decisions" ("delivery_id");

CREATE INDEX "labeling_decisions_repository_subject_created_at"
  ON "labeling_decisions" (
    "repository_id",
    "subject_type",
    "subject_number",
    "created_at"
  );
