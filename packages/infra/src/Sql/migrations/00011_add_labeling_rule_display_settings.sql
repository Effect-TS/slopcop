ALTER TABLE "labeling_rules"
ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Untitled rule'
CHECK (length("name") BETWEEN 1 AND 100);

UPDATE "labeling_rules"
SET "name" = "label"
WHERE "name" = 'Untitled rule';

ALTER TABLE "labeling_rules"
ADD COLUMN "confidence_threshold" REAL NOT NULL DEFAULT 0.75
CHECK (
  "confidence_threshold" >= 0
  AND "confidence_threshold" <= 1
);
