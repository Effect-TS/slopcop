ALTER TABLE "labeling_rules"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ai'
CHECK ("kind" IN ('ai', 'ready-for-review'));

CREATE UNIQUE INDEX "labeling_decisions_delivery_subject_processor_unique"
ON "labeling_decisions" (
  "delivery_id",
  "repository_id",
  "subject_type",
  "subject_number",
  "prompt_version"
);
