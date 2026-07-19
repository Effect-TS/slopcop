CREATE TABLE "github_events" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "github_events_status_updated_at" ON "github_events" ("status","updatedAt");
