CREATE TABLE "oauth_states" (
  "state_hash" TEXT PRIMARY KEY,
  "code_verifier" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL
);

CREATE INDEX "oauth_states_expires_at"
  ON "oauth_states" ("expires_at");

CREATE TABLE "github_users" (
  "github_id" TEXT PRIMARY KEY,
  "login" TEXT NOT NULL,
  "name" TEXT,
  "avatar_url" TEXT NOT NULL,
  "organizations" TEXT NOT NULL CHECK (json_valid("organizations")),
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL
);

CREATE TABLE "auth_sessions" (
  "token_hash" TEXT PRIMARY KEY,
  "github_user_id" TEXT NOT NULL,
  "access_status" TEXT NOT NULL,
  "installation_url" TEXT,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "last_seen_at" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "revoked_at" INTEGER,
  CONSTRAINT "auth_sessions_github_user_id_fkey"
    FOREIGN KEY ("github_user_id")
    REFERENCES "github_users" ("github_id")
    ON DELETE CASCADE,
  CONSTRAINT "auth_sessions_access_status_valid"
    CHECK (
      "access_status" IN (
        'Ready',
        'AppNotInstalled',
        'NoRepositoryAccess',
        'MissingAdministrationPermission'
      )
    )
);

CREATE INDEX "auth_sessions_github_user_id"
  ON "auth_sessions" ("github_user_id");

CREATE INDEX "auth_sessions_expires_at"
  ON "auth_sessions" ("expires_at");
