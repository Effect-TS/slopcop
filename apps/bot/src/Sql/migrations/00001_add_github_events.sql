CREATE TABLE "github_events" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending' NOT NULL,
  "attempts" INTEGER DEFAULT 0 NOT NULL,
  "last_error" TEXT,
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "deleted_at" INTEGER,
  CONSTRAINT "github_events_status_valid"
    CHECK ("status" IN ('pending', 'processing', 'completed'))
);

CREATE INDEX "github_events_status_updated_at"
  ON "github_events" ("status", "updated_at");
