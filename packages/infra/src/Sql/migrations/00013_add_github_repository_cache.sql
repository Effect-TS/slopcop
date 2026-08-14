CREATE TABLE "github_repository_labels" (
  "repository_id" TEXT NOT NULL,
  "name" TEXT NOT NULL COLLATE NOCASE,
  "description" TEXT,
  "color" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  PRIMARY KEY ("repository_id", "name", "generation"),
  FOREIGN KEY ("repository_id") REFERENCES "github_repositories" ("id") ON DELETE CASCADE,
  CONSTRAINT "github_repository_labels_name_valid" CHECK (length("name") BETWEEN 1 AND 50),
  CONSTRAINT "github_repository_labels_color_valid" CHECK (
    length("color") = 6 AND "color" NOT GLOB '*[^0-9A-Fa-f]*'
  )
);

CREATE INDEX "github_repository_labels_active"
  ON "github_repository_labels" ("repository_id", "generation", "name");

CREATE TABLE "github_repository_label_syncs" (
  "repository_id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL,
  "etag" TEXT,
  "last_modified" TEXT,
  "last_attempt_at" INTEGER,
  "last_success_at" INTEGER,
  "next_refresh_at" INTEGER NOT NULL,
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "active_generation" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("repository_id") REFERENCES "github_repositories" ("id") ON DELETE CASCADE,
  CONSTRAINT "github_repository_label_syncs_status_valid" CHECK (
    "status" IN ('pending', 'refreshing', 'ready', 'failed')
  ),
  CONSTRAINT "github_repository_label_syncs_failures_valid" CHECK ("consecutive_failures" >= 0)
);

CREATE INDEX "github_repository_label_syncs_due"
  ON "github_repository_label_syncs" ("next_refresh_at", "status");

CREATE TABLE "github_pull_requests" (
  "repository_id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "draft" INTEGER NOT NULL,
  "author" TEXT,
  "base_ref" TEXT NOT NULL,
  "head_sha" TEXT NOT NULL,
  "github_created_at" INTEGER NOT NULL,
  "github_updated_at" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL,
  PRIMARY KEY ("repository_id", "number", "generation"),
  FOREIGN KEY ("repository_id") REFERENCES "github_repositories" ("id") ON DELETE CASCADE,
  CONSTRAINT "github_pull_requests_number_valid" CHECK ("number" > 0),
  CONSTRAINT "github_pull_requests_state_valid" CHECK ("state" IN ('open', 'closed')),
  CONSTRAINT "github_pull_requests_draft_valid" CHECK ("draft" IN (0, 1))
);

CREATE INDEX "github_pull_requests_repository_state_updated"
  ON "github_pull_requests" ("repository_id", "state", "github_updated_at" DESC, "number" DESC);

CREATE TABLE "github_pull_request_syncs" (
  "repository_id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL,
  "etag" TEXT,
  "last_modified" TEXT,
  "last_attempt_at" INTEGER,
  "last_success_at" INTEGER,
  "next_refresh_at" INTEGER NOT NULL,
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "active_generation" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("repository_id") REFERENCES "github_repositories" ("id") ON DELETE CASCADE,
  CONSTRAINT "github_pull_request_syncs_status_valid" CHECK (
    "status" IN ('pending', 'refreshing', 'ready', 'failed')
  ),
  CONSTRAINT "github_pull_request_syncs_failures_valid" CHECK ("consecutive_failures" >= 0)
);

CREATE INDEX "github_pull_request_syncs_due"
  ON "github_pull_request_syncs" ("next_refresh_at", "status");
