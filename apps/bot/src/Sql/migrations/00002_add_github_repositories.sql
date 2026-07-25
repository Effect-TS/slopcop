CREATE TABLE "github_repositories" (
  "id" TEXT PRIMARY KEY,
  "github_id" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "repo" TEXT NOT NULL,
  "installation_id" TEXT NOT NULL,
  "enabled" INTEGER DEFAULT 1 NOT NULL
    CHECK ("enabled" IN (0, 1)),
  "rules_revision" INTEGER DEFAULT 0 NOT NULL,
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "deleted_at" INTEGER,
  CONSTRAINT "github_repositories_rules_revision_nonnegative"
    CHECK ("rules_revision" >= 0)
);

CREATE UNIQUE INDEX "github_repositories_github_id_unique"
  ON "github_repositories" ("github_id");

CREATE UNIQUE INDEX "github_repositories_owner_repo"
  ON "github_repositories" ("owner", "repo");
