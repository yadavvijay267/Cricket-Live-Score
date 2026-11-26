// Drizzle schema for this space: one snapshot table holding the latest
// distilled cricket score payloads, newest first.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scoreSnapshots = sqliteTable("score_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // JSON array of distilled match rows (see actions.ts MatchRow).
  payload: text("payload").notNull(),
  // Source names backing this snapshot, JSON array of strings.
  sources: text("sources").notNull().default("[]"),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
