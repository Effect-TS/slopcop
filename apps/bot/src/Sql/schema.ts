import { defineRelations } from "drizzle-orm"
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const GitHubEvents = pgTable(
  "github_events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "completed"],
    }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("github_events_status_updated_at").on(table.status, table.updatedAt),
  ],
)

export const relations = defineRelations({ GitHubEvents }, () => ({}))
