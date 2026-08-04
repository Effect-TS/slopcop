CREATE TABLE "github_installations" (
  "github_id" TEXT PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "account_login" TEXT NOT NULL,
  "account_type" TEXT NOT NULL,
  "repository_selection" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sync_status" TEXT NOT NULL,
  "html_url" TEXT NOT NULL,
  "last_error" TEXT,
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "deleted_at" INTEGER,
  CONSTRAINT "github_installations_account_type_valid"
    CHECK ("account_type" IN ('Organization', 'User')),
  CONSTRAINT "github_installations_repository_selection_valid"
    CHECK ("repository_selection" IN ('all', 'selected')),
  CONSTRAINT "github_installations_status_valid"
    CHECK ("status" IN ('active', 'suspended')),
  CONSTRAINT "github_installations_sync_status_valid"
    CHECK ("sync_status" IN ('pending', 'ready', 'failed'))
);

CREATE INDEX "github_installations_active"
  ON "github_installations" ("status", "deleted_at");
