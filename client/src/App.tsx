import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";

type Scores = ApiResponse<typeof api, "getScores">;
type Match = Scores["matches"][number];
type Tab = "all" | "live" | "finished" | "upcoming";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "finished", label: "Results" },
  { id: "upcoming", label: "Upcoming" },
];

function isIndiaMatch(m: Match): boolean {
  const t = `${m.team1} ${m.team2}`.toLowerCase();
  return t.includes("india");
}

function initials(name: string): string {
  const words = name.replace(/[^a-zA-Z ]/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "?").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(d);
}

function TeamRow({
  name,
  score,
  big,
  dimmed,
}: {
  name: string;
  score: string | null;
  big?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-xs font-extrabold text-[var(--accent)] dark:text-[var(--gold)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {initials(name)}
      </span>
      <span
        className={`min-w-0 flex-1 font-semibold ${dimmed ? "text-[var(--dim)]" : "text-[var(--text)]"} ${big ? "text-lg" : "text-base"}`}
      >
        {name}
      </span>
      <span
        className={`min-w-0 flex-1 text-right leading-snug font-extrabold break-words tabular-nums ${dimmed ? "text-[var(--dim)]" : "text-[var(--text)]"} ${big ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {score ?? "—"}
      </span>
    </div>
  );
}

function MatchCard({ match, hero }: { match: Match; hero?: boolean }) {
  const india = isIndiaMatch(match);
  const meta = [match.tournament, match.format, match.venue]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      className={`rounded-[var(--radius)] border bg-[var(--surface)] p-4 ${
        india
          ? "border-[var(--gold)] shadow-[inset_4px_0_0_0_var(--gold)]"
          : "border-[var(--border)]"
      } ${hero ? "p-5" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs font-medium tracking-wide text-[var(--dim)] uppercase">
          {meta || "Cricket match"}
        </p>
        {match.status === "live" ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--live)] px-2.5 py-1 text-[11px] font-extrabold tracking-widest text-white uppercase">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
            Live
          </span>
        ) : match.status === "upcoming" ? (
          <span className="shrink-0 rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-[11px] font-bold tracking-widest text-[var(--dim)] uppercase">
            Upcoming
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-[11px] font-bold tracking-widest text-[var(--dim)] uppercase">
            Result
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2.5">
        <TeamRow name={match.team1} score={match.score1} big={hero} />
        <TeamRow name={match.team2} score={match.score2} big={hero} />
      </div>

      {(match.statusText || match.startsAt) && (
        <p
          className={`mt-3 text-sm font-medium ${
            match.status === "live"
              ? "text-[var(--live)]"
              : match.status === "finished"
                ? "text-[var(--accent)] dark:text-[var(--gold)]"
                : "text-[var(--dim)]"
          }`}
        >
          {match.statusText ??
            (match.startsAt ? `Starts ${formatTime(match.startsAt)}` : "")}
          {match.status === "upcoming" &&
          match.statusText &&
          match.startsAt
            ? ` · ${formatTime(match.startsAt)}`
            : ""}
        </p>
      )}
    </article>
  );
}

function Section({
  title,
  matches,
  heroFirst,
}: {
  title: string;
  matches: Match[];
  heroFirst?: boolean;
}) {
  if (matches.length === 0) return null;
  return (
    <section className="mt-6">
      <h2
        className="text-sm font-extrabold tracking-widest text-[var(--dim)] uppercase"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3">
        {matches.map((m, i) => (
          <MatchCard
            key={`${m.team1}-${m.team2}-${m.tournament ?? ""}`}
            match={m}
            hero={heroFirst && i === 0}
          />
        ))}
      </div>
    </section>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const scores = useQuery({
    queryKey: ["scores"],
    queryFn: () => api.getScores({}),
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: async () => await api.refreshScores({}),
    onSuccess: (data) => {
      queryClient.setQueryData(["scores"], data);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["scores"] });
    },
  });

  const data = scores.data;
  const matches = useMemo(() => {
    const all = data?.matches ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((m) =>
      `${m.team1} ${m.team2} ${m.tournament ?? ""} ${m.venue ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [data, search]);

  const live = matches.filter((m) => m.status === "live");
  const upcoming = matches.filter((m) => m.status === "upcoming");
  const finished = matches.filter((m) => m.status === "finished");
  const liveCount = (data?.matches ?? []).filter(
    (m) => m.status === "live",
  ).length;

  const visibleCount =
    tab === "all"
      ? matches.length
      : tab === "live"
        ? live.length
        : tab === "upcoming"
          ? upcoming.length
          : finished.length;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />

      <main className="mx-auto w-full max-w-2xl px-4 pb-10">
        {/* Scoreboard header strip */}
        <div className="pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p
                className="text-3xl font-black tracking-tight text-[var(--text)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {scores.isPending
                  ? "Loading scores…"
                  : liveCount > 0
                    ? `${liveCount} match${liveCount === 1 ? "" : "es"} live`
                    : "No live match right now"}
              </p>
              <p className="mt-1 text-sm text-[var(--dim)]">
                {data?.asOf
                  ? `Updated ${formatTime(data.asOf)}${data.stale ? " · refreshing…" : ""}`
                  : "Fetching the latest scores…"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Refresh scores"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-text)] disabled:opacity-60"
            >
              {refresh.isPending ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Match filter"
            className="mt-4 grid grid-cols-4 gap-1 rounded-full bg-[var(--surface-alt)] p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-2 py-1.5 text-sm font-bold ${
                  tab === t.id
                    ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                    : "text-[var(--dim)]"
                }`}
              >
                {t.label}
                {t.id === "live" && liveCount > 0 ? ` (${liveCount})` : ""}
              </button>
            ))}
          </div>

          <label className="sr-only" htmlFor="team-search">
            Search by team, tournament or venue
          </label>
          <input
            id="team-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team, tournament, venue…"
            className="mt-3 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-base text-[var(--text)] placeholder:text-[var(--dim)]"
          />
        </div>

        {data?.error && (
          <p className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--dim)]">
            {data.error}
          </p>
        )}
        {refresh.isError && (
          <p className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--dim)]">
            Refresh failed — showing the last update. Try again in a moment.
          </p>
        )}

        {scores.isPending ? (
          <div className="mt-8 space-y-3" aria-label="Loading scores">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-[var(--radius)] bg-[var(--surface)]"
              />
            ))}
          </div>
        ) : scores.isError ? (
          <div className="mt-10 text-center">
            <p className="text-base font-semibold text-[var(--text)]">
              Scores could not load.
            </p>
            <p className="mt-1 text-sm text-[var(--dim)]">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => scores.refetch()}
              className="mt-4 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold text-[var(--accent-text)]"
            >
              Try again
            </button>
          </div>
        ) : visibleCount === 0 ? (
          <div className="mt-10 text-center">
            <p className="text-base font-semibold text-[var(--text)]">
              {search.trim()
                ? `No matches found for “${search.trim()}”.`
                : tab === "live"
                  ? "No match is live right now."
                  : tab === "upcoming"
                    ? "No upcoming matches listed."
                    : tab === "finished"
                      ? "No recent results listed."
                      : "No matches listed right now."}
            </p>
            <p className="mt-1 text-sm text-[var(--dim)]">
              {search.trim()
                ? "Try a different team or tournament name."
                : "Scores refresh on their own through the day — or tap Refresh."}
            </p>
          </div>
        ) : tab === "all" ? (
          <>
            <Section title="Live now" matches={live} heroFirst />
            <Section title="Upcoming" matches={upcoming} />
            <Section title="Results" matches={finished} />
          </>
        ) : (
          <div className="mt-6 space-y-3">
            {(tab === "live"
              ? live
              : tab === "upcoming"
                ? upcoming
                : finished
            ).map((m, i) => (
              <MatchCard
                key={`${m.team1}-${m.team2}-${m.tournament ?? ""}`}
                match={m}
                hero={tab === "live" && i === 0}
              />
            ))}
          </div>
        )}

        {data && data.sources.length > 0 && (
          <p className="mt-8 text-center text-xs text-[var(--dim)]">
            Sources: {data.sources.join(" · ")}
          </p>
        )}
      </main>
    </div>
  );
}
