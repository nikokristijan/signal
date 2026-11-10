"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useBomb } from "@/components/BombProvider";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { Loading, Page } from "@/components/Page";
import type { LeaderboardEntry, LeaderboardScope } from "@/lib/game/types";

const TABS: Array<{ id: LeaderboardScope; label: string }> = [
  { id: "friends", label: "Prijatelji" },
  { id: "daily", label: "Danas" },
  { id: "weekly", label: "Tjedan" },
  { id: "all", label: "High score" },
];

export default function LeaderboardPage() {
  const { ready, repo, profile, today, daily } = useBomb();
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
  }, [repo, profile, scope, today, daily?.gamesToday]);

  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;

  const me = rows?.find((r) => r.isMe);
  const played = (daily?.gamesToday ?? 0) > 0;

  return (
    <Page>
      <h1 className="text-3xl font-extrabold tracking-tight">Ljestvica</h1>
      <div role="tablist" aria-label="Razdoblje" className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={scope === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setScope(t.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
              scope === t.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-raised"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {scope === "friends" ? "Najbolji današnji rezultat tvojih prijatelja." : scope === "daily" ? "Najbolji rezultat svih igrača danas." : scope === "weekly" ? "Najbolji rezultat ovaj tjedan (od ponedjeljka)." : "High score svih vremena: najbolja pojedinačna partija."}
      </p>

      <div className="mt-3">
        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="tile px-4 py-8 text-center text-muted">Još nitko nema rezultat.</p>
        ) : (
          <LeaderboardTable rows={rows} />
        )}
      </div>

      {rows && !me && (
        <p className="mt-3 text-center text-sm text-muted">
          {played && scope !== "daily" && scope !== "friends" ? "Još nisi na ovoj ljestvici." : (
            <>
              <Link href="/igra" className="font-bold text-ink underline underline-offset-2">Odigraj partiju</Link> da se pojaviš ovdje.
            </>
          )}
        </p>
      )}
      {repo?.mode === "local" && (
        <p className="mt-6 text-center text-xs text-muted" data-testid="demo-note">
          Demo način: ostali igrači su simulirani, a tvoji podaci ostaju u ovom pregledniku. Spoji Supabase za prave prijatelje i ljestvice.
        </p>
      )}
    </Page>
  );
}
