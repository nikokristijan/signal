"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useGame } from "@/components/GameProvider";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { Loading, Page } from "@/components/Page";
import type { LeaderboardEntry, LeaderboardScope } from "@/lib/game/types";

const TABS: Array<{ id: LeaderboardScope; label: string }> = [
  { id: "friends", label: "Friends" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "all", label: "All-time" },
];

export default function LeaderboardPage() {
  const { ready, repo, profile, today, attempt } = useGame();
  const [scope, setScope] = useState<LeaderboardScope>("friends");
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    if (!repo || !profile) return;
    let off = false;
    setRows(null);
    void repo.getLeaderboard(scope, today).then((r) => !off && setRows(r));
    return () => {
      off = true;
    };
  }, [repo, profile, scope, today, attempt?.status]);

  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;

  const me = rows?.find((r) => r.isMe);
  const playedToday = attempt && attempt.status !== "playing";

  return (
    <Page>
      <h1 className="text-3xl font-extrabold tracking-tight">Leaderboard</h1>
      <div role="tablist" aria-label="Leaderboard period" className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={scope === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setScope(t.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              scope === t.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="tile px-4 py-8 text-center text-muted">Nobody has scored yet.</p>
        ) : (
          <LeaderboardTable rows={rows} friends={scope === "friends"} />
        )}
      </div>

      {rows && scope !== "friends" && !me && (
        <p className="mt-3 text-center text-sm text-muted">
          {playedToday || scope === "all" ? "You're not on this board yet." : (
            <>
              <Link href="/play" className="font-semibold text-ink underline underline-offset-2">Play today&apos;s challenge</Link> to appear here.
            </>
          )}
        </p>
      )}
      {repo?.mode === "local" && (
        <p className="mt-6 text-center text-xs text-muted" data-testid="demo-note">
          Demo mode: other players are simulated and your data stays in this browser. Connect Supabase for real friends and rankings.
        </p>
      )}
    </Page>
  );
}
