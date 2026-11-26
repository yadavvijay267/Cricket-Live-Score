// Actions for Cricket Live Score.
//
// Data flow (one retrieval path):
//   refreshScores / getScores (when stale) -> fetchAndStore()
//     -> ctx.tool.sports_data + ctx.tool.web_search (live sources)
//     -> ctx.inference.complete distills the source text into typed match rows
//     -> rows are deduped, sorted and stored as one snapshot in ctx.db
//   getScores serves the newest snapshot; the client never fetches sources
//   directly. On source failure the last good snapshot is served, labeled
//   with its fetched-at time — scores are never invented.

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { desc, sql } from "drizzle-orm";
import * as schema from "./schema";

const matchSchema = z.object({
  team1: z.string(),
  team2: z.string(),
  score1: z.string().nullable(),
  score2: z.string().nullable(),
  status: z.enum(["live", "finished", "upcoming"]),
  statusText: z.string().nullable(),
  tournament: z.string().nullable(),
  venue: z.string().nullable(),
  format: z.string().nullable(),
  startsAt: z.string().nullable(),
});

type MatchRow = z.infer<typeof matchSchema>;

const scoresResponse = z.object({
  matches: z.array(matchSchema),
  asOf: z.string().nullable(),
  sources: z.array(z.string()),
  stale: z.boolean(),
  error: z.string().nullable(),
});

type ScoresResponse = z.infer<typeof scoresResponse>;

const STALE_MS = 2 * 60 * 1000;
const KEEP_SNAPSHOTS = 20;

async function latestSnapshot(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.scoreSnapshots)
    .orderBy(desc(schema.scoreSnapshots.id))
    .limit(1);
  return rows[0] ?? null;
}

function toResponse(
  snapshot: { payload: string; sources: string; fetchedAt: Date } | null,
  error: string | null,
): ScoresResponse {
  if (!snapshot) {
    return {
      matches: [],
      asOf: null,
      sources: [],
      stale: true,
      error:
        error ??
        "Scores are unavailable right now. Tap Refresh to try again.",
    };
  }
  let matches: MatchRow[] = [];
  let sources: string[] = [];
  try {
    matches = matchSchema.array().parse(JSON.parse(snapshot.payload));
  } catch {
    matches = [];
  }
  try {
    const parsed: unknown = JSON.parse(snapshot.sources);
    if (Array.isArray(parsed)) {
      sources = parsed.filter((s): s is string => typeof s === "string");
    }
  } catch {
    sources = [];
  }
  return {
    matches,
    asOf: snapshot.fetchedAt.toISOString(),
    sources,
    stale: Date.now() - snapshot.fetchedAt.getTime() > STALE_MS,
    error,
  };
}

function dedupeAndSort(matches: MatchRow[]): MatchRow[] {
  const byKey = new Map<string, MatchRow>();
  const statusRank = { live: 0, upcoming: 1, finished: 2 } as const;
  for (const m of matches) {
    const pair = [m.team1.toLowerCase().trim(), m.team2.toLowerCase().trim()]
      .sort()
      .join(" vs ");
    const key = `${pair}|${(m.tournament ?? "").toLowerCase().trim()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, m);
      continue;
    }
    // Prefer the row that is more "current", then the one with more scores.
    const better =
      statusRank[m.status] < statusRank[existing.status] ||
      (statusRank[m.status] === statusRank[existing.status] &&
        (m.score1 ? 1 : 0) + (m.score2 ? 1 : 0) >
          (existing.score1 ? 1 : 0) + (existing.score2 ? 1 : 0));
    if (better) byKey.set(key, m);
  }
  const list = [...byKey.values()];
  list.sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    if (a.status === "upcoming") {
      return (a.startsAt ?? "9999") < (b.startsAt ?? "9999") ? -1 : 1;
    }
    if (a.status === "finished") {
      return (a.startsAt ?? "") > (b.startsAt ?? "") ? -1 : 1;
    }
    return 0;
  });
  return list;
}

/** Fetches both live sources, distills them into match rows and stores a
 *  snapshot. Returns true when a new snapshot was stored. */
async function fetchAndStore(ctx: Ctx): Promise<boolean> {
  const [sportsCricket, sportsLive, sportsIndia, webToday, webIndia] =
    await Promise.allSettled([
      ctx.tool.sports_data("cricket"),
      ctx.tool.sports_data("cricket live"),
      ctx.tool.sports_data("India cricket"),
      ctx.tool.web_search("live cricket scores today matches"),
      ctx.tool.web_search("India cricket match live score upcoming fixtures"),
    ]);

  const sections: string[] = [];
  const sourceNames = new Set<string>();

  const sportsResults = [sportsCricket, sportsLive, sportsIndia];
  for (const result of sportsResults) {
    if (result.status !== "fulfilled") continue;
    for (const s of result.value.content.sources) sourceNames.add(s.title);
    for (const item of result.value.content.items) {
      const lines = [
        `MATCH: ${item.title}`,
        item.teams?.length ? `Teams: ${item.teams.join(" vs ")}` : "",
        item.league ? `Tournament: ${item.league}` : "",
        item.status ? `Status code: ${item.status}` : "",
        item.score ? `Score: ${item.score}` : "",
        item.starts_at ? `Starts at (UTC): ${item.starts_at}` : "",
        item.summary ? `Details: ${item.summary.slice(0, 2500)}` : "",
      ].filter(Boolean);
      sections.push(lines.join("\n"));
    }
  }

  const webResults = [webToday, webIndia];
  for (const result of webResults) {
    if (result.status !== "fulfilled") continue;
    for (const s of result.value.content.sources) sourceNames.add(s.title);
    for (const r of result.value.content.results.slice(0, 6)) {
      if (!r.snippet) continue;
      sections.push(
        `WEB (${r.source ?? r.title}): ${r.title}\n${r.snippet.slice(0, 3000)}`,
      );
    }
  }

  if (sections.length === 0) return false;

  const sourceText = sections.join("\n\n---\n\n").slice(0, 16000);
  const today = new Date().toISOString().slice(0, 10);

  const distilled = await ctx.inference.complete(
    [
      `Today's date is ${today}. Below are live cricket score sources (structured sports feed entries and score-page snippets). Extract EVERY distinct cricket match mentioned.`,
      "Rules:",
      "- team1/team2: the two team names, exactly as written in the source.",
      "- score1 is team1's innings score exactly as shown (e.g. \"342/10 & 42/2 (17 ov)\" or \"275/3 (89 ov)\"); score2 likewise. Use null when a team has not batted or no score is shown. Never invent or compute a score.",
      "- status: \"live\" when the match is in progress right now (including stumps in a multi-day match that is not finished), \"finished\" when a result is decided, \"upcoming\" when it has not started.",
      "- statusText: one short line from the source — the result (\"Dubai Capitals won by 45 runs\"), the live situation (\"Tasmania trail by 55 runs\"), or for upcoming matches the start info (\"Starts 3:30 PM IST\"). Always write it in English, translating if the source line is in another language. Null if none is given.",
      "- tournament, venue, format (Test/ODI/T20/T10): copy from the source; null when not stated.",
      "- startsAt: ISO 8601 start time when the source gives one, else null.",
      "- If the same match appears in several sources, include it once with the most complete details.",
      "",
      "SOURCES:",
      sourceText,
    ].join("\n"),
    { schema: z.object({ matches: z.array(matchSchema) }), timeout_secs: 90 },
  );

  const matches = dedupeAndSort(
    distilled.matches.filter((m) => m.team1.trim() && m.team2.trim()),
  );

  const db = ctx.db<typeof schema>();
  const previous = await latestSnapshot(ctx);
  if (matches.length === 0 && previous) return false;

  await db.insert(schema.scoreSnapshots).values({
    payload: JSON.stringify(matches),
    sources: JSON.stringify([...sourceNames].slice(0, 8)),
    fetchedAt: new Date(),
  });
  await db.run(
    sql`DELETE FROM score_snapshots WHERE id NOT IN (SELECT id FROM score_snapshots ORDER BY id DESC LIMIT ${KEEP_SNAPSHOTS})`,
  );
  ctx.invalidateQueries();
  return true;
}

export const Actions = {
  getScores: defineAction({
    description:
      "Returns the latest cricket match scores (live, upcoming, finished), refreshing from live sources when the cached snapshot is stale.",
    request: z.object({}),
    response: scoresResponse,
    async handler(ctx): Promise<ScoresResponse> {
      let snapshot = await latestSnapshot(ctx);
      let error: string | null = null;
      const stale =
        !snapshot || Date.now() - snapshot.fetchedAt.getTime() > STALE_MS;
      if (stale) {
        try {
          await fetchAndStore(ctx);
          snapshot = await latestSnapshot(ctx);
        } catch {
          error = "Could not refresh scores just now — showing the last update.";
        }
      }
      return toResponse(snapshot, error);
    },
  }),

  refreshScores: defineAction({
    description:
      "Forces a refresh of cricket scores from the live sources and returns the newest snapshot. Used by the Refresh button and the scheduled refresh.",
    request: z.object({}),
    response: scoresResponse,
    async handler(ctx): Promise<ScoresResponse> {
      let error: string | null = null;
      try {
        const stored = await fetchAndStore(ctx);
        if (!stored) {
          error = "No new scores came back from the sources — showing the last update.";
        }
      } catch {
        error = "Could not refresh scores just now — showing the last update.";
      }
      const snapshot = await latestSnapshot(ctx);
      return toResponse(snapshot, error);
    },
  }),
} satisfies ActionsModule;
