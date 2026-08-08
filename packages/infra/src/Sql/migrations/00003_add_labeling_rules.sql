CREATE TABLE "labeling_rules" (
  "id" TEXT PRIMARY KEY,
  "repository_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "confidence_threshold" REAL NOT NULL,
  "mode" TEXT NOT NULL,
  "exclusive_group" TEXT,
  "enabled" INTEGER NOT NULL
    CHECK ("enabled" IN (0, 1)),
  "validation_status" TEXT NOT NULL,
  "validated_at" INTEGER,
  "version" INTEGER NOT NULL,
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "deleted_at" INTEGER,
  CONSTRAINT "labeling_rules_repository_id_github_repositories_id_fkey"
    FOREIGN KEY ("repository_id")
    REFERENCES "github_repositories" ("id")
    ON DELETE CASCADE,
  CONSTRAINT "labeling_rules_label_length"
    CHECK (length("label") BETWEEN 1 AND 50),
  CONSTRAINT "labeling_rules_name_length"
    CHECK (length("name") BETWEEN 1 AND 100),
  CONSTRAINT "labeling_rules_instructions_length"
    CHECK (length("instructions") BETWEEN 1 AND 4000),
  CONSTRAINT "labeling_rules_confidence_threshold_valid"
    CHECK (
      "confidence_threshold" >= 0
      AND "confidence_threshold" <= 1
    ),
  CONSTRAINT "labeling_rules_exclusive_group_length"
    CHECK (
      "exclusive_group" IS NULL
      OR length("exclusive_group") BETWEEN 1 AND 100
    ),
  CONSTRAINT "labeling_rules_mode_valid"
    CHECK ("mode" IN ('add-only', 'reconcile')),
  CONSTRAINT "labeling_rules_validation_status_valid"
    CHECK ("validation_status" IN ('valid', 'missing', 'unknown')),
  CONSTRAINT "labeling_rules_enabled_is_valid"
    CHECK (NOT "enabled" OR "validation_status" = 'valid'),
  CONSTRAINT "labeling_rules_version_positive"
    CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "labeling_rules_repository_label_unique"
  ON "labeling_rules" ("repository_id", lower("label"));

CREATE INDEX "labeling_rules_repository_created_at"
  ON "labeling_rules" ("repository_id", "created_at");

CREATE INDEX "labeling_rules_stale_enabled"
  ON "labeling_rules" ("enabled", "validation_status", "validated_at");
