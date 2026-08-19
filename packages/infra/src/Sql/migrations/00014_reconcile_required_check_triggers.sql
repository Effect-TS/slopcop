INSERT INTO "labeling_policy_versions" (
  "id","policy_id","repository_id","revision","program","content_hash",
  "registry_manifest","trigger_manifest","publication_status"
)
SELECT
  'policy-version:ready-check-suite:'||current."repository_id",
  current."id",
  current."repository_id",
  (SELECT max(candidate."revision") + 1
   FROM "labeling_policy_versions" AS candidate
   WHERE candidate."policy_id"=current."id"),
  previous."program",
  'generic-ready-v4-check-suite',
  previous."registry_manifest",
  json_array(
    'pull_request:opened',
    'pull_request:reopened',
    'pull_request:synchronize',
    'pull_request:edited',
    'pull_request:ready_for_review',
    'pull_request:converted_to_draft',
    'pull_request:labeled',
    'pull_request:unlabeled',
    'check_run:rerequested',
    'check_run:completed',
    'check_suite:completed',
    'status:*',
    'pull_request_review:submitted',
    'pull_request_review:dismissed'
  ),
  'staged'
FROM "labeling_policies" AS current
INNER JOIN "labeling_policy_versions" AS previous
  ON previous."id"=current."published_version_id"
WHERE previous."id"='policy-version:ready:'||current."repository_id"
  AND previous."content_hash"='generic-ready-v3';

INSERT INTO "labeling_policy_triggers" (
  "policy_version_id","repository_id","event","action"
)
SELECT
  version."id",
  version."repository_id",
  substr(value,1,instr(value,':')-1),
  substr(value,instr(value,':')+1)
FROM "labeling_policy_versions" AS version,
  json_each(version."trigger_manifest")
WHERE version."id"='policy-version:ready-check-suite:'||version."repository_id";

UPDATE "labeling_policy_versions"
SET "publication_status"='published'
WHERE "id"='policy-version:ready-check-suite:'||"repository_id";

UPDATE "labeling_policies"
SET
  "published_version_id"='policy-version:ready-check-suite:'||"repository_id",
  "version"="version"+1,
  "updated_at"=unixepoch()*1000
WHERE EXISTS (
  SELECT 1
  FROM "labeling_policy_versions" AS version
  WHERE version."id"='policy-version:ready-check-suite:'||"labeling_policies"."repository_id"
    AND version."policy_id"="labeling_policies"."id"
    AND version."publication_status"='published'
);
