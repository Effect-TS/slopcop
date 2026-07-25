INSERT INTO "github_repositories" (
  "id",
  "github_id",
  "owner",
  "repo",
  "installation_id",
  "enabled",
  "rules_revision"
)
VALUES (
  '019be000-0000-7000-8000-000000000001',
  '221458136',
  'Effect-TS',
  'effect',
  '1',
  0,
  1
)
ON CONFLICT ("github_id") DO UPDATE SET
  "owner" = excluded."owner",
  "repo" = excluded."repo",
  "updated_at" = unixepoch() * 1000;

INSERT OR IGNORE INTO "labeling_rules" (
  "id",
  "repository_id",
  "label",
  "instructions",
  "mode",
  "exclusive_group",
  "enabled",
  "validation_status",
  "validated_at",
  "version"
)
SELECT
  '019be000-0000-7000-8000-000000000002',
  "id",
  '3.0',
  'Apply when the pull request specifically targets, maintains, or fixes Effect version 3.x rather than version 4.x.',
  'reconcile',
  'effect-version',
  1,
  'valid',
  unixepoch() * 1000,
  1
FROM "github_repositories"
WHERE "github_id" = '221458136';

UPDATE "github_repositories"
SET
  "rules_revision" = MAX("rules_revision", 1),
  "updated_at" = unixepoch() * 1000
WHERE "github_id" = '221458136';

INSERT OR IGNORE INTO "labeling_rules" (
  "id",
  "repository_id",
  "label",
  "instructions",
  "mode",
  "exclusive_group",
  "enabled",
  "validation_status",
  "validated_at",
  "version"
)
SELECT
  '019be000-0000-7000-8000-000000000003',
  "id",
  '4.0',
  'Apply when the pull request specifically targets, introduces, maintains, or fixes Effect version 4.x rather than version 3.x.',
  'reconcile',
  'effect-version',
  1,
  'valid',
  unixepoch() * 1000,
  1
FROM "github_repositories"
WHERE "github_id" = '221458136';

INSERT OR IGNORE INTO "labeling_rules" (
  "id",
  "repository_id",
  "label",
  "instructions",
  "mode",
  "exclusive_group",
  "enabled",
  "validation_status",
  "validated_at",
  "version"
)
SELECT
  '019be000-0000-7000-8000-000000000004',
  "id",
  'enhancement',
  'Apply only when the primary purpose is a net-new capability or an improvement to behavior that was already correct. Do not apply when the work primarily fixes incorrect behavior, a regression, silently ignored invalid input, validation, or error handling.',
  'add-only',
  'change-kind',
  1,
  'valid',
  unixepoch() * 1000,
  1
FROM "github_repositories"
WHERE "github_id" = '221458136';

INSERT OR IGNORE INTO "labeling_rules" (
  "id",
  "repository_id",
  "label",
  "instructions",
  "mode",
  "exclusive_group",
  "enabled",
  "validation_status",
  "validated_at",
  "version"
)
SELECT
  '019be000-0000-7000-8000-000000000005',
  "id",
  'bug',
  'Apply when the primary purpose is to correct behavior that is incorrect, unintended, silently ignored, regressed, or improperly validated. This includes adding validation or an error path that makes existing behavior conform to its intended contract. Prefer bug over enhancement when corrective work also adds implementation logic.',
  'add-only',
  'change-kind',
  1,
  'valid',
  unixepoch() * 1000,
  1
FROM "github_repositories"
WHERE "github_id" = '221458136';
