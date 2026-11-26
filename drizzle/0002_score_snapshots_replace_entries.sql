DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE score_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  fetched_at INTEGER NOT NULL
);
