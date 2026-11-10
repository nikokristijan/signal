"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useBomb } from "@/components/BombProvider";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { LeagueToggle } from "@/components/LeagueToggle";
import { Loading, Page } from "@/components/Page";
import type { Mode } from "@/lib/game/constants";
import type { LeaderboardEntry, LeaderboardScope } from "@/lib/game/types";

const TABS: Array<{ id: LeaderboardScope; label: string }> = [
  { id: "friends", label: "Prijatelji" },
  { id: "daily", label: "Danas" },
  { id: "weekly", label: "Tjedan" },
  { id: "all", label: "High score" },
];

export default function LeaderboardPage() {
  const { ready, repo, profile, today, daily, training } = useBomb();
  const [league, setLeague] = useState<Mode>("daily");
  const [scope, setScope] = useState<LeaderboardScope>("friends");

  // ?liga=trening otvara trening ligu (npr. s ekrana s rezultatom)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("liga") === "trening") setLeague("training");
  }, []);
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    if (!repo || !profile) return;
    let off = false;
    setRows(null);
    void repo.getLeaderboard(league, scope, today).then((r) => !off && setRows(r));
    return () => {
      off = true;
    };
  }, [repo, profile, league, scope, today, daily?.gamesToday, training?.gamesToday]);

  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;

  const me = rows?.find((r) => r.isMe);
  const played = ((league === "daily" ? daily : training)?.gamesToday ?? 0) > 0;

  return (
    <Page>
      <h1 className="text-3xl font-extrabold tracking-tight">Ljestvica</h1>
      <div className="mt-4"><LeagueToggle value={league} onChange={(m) => { setLeague(m); setRows(null); }} /></div>
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
        {league === "daily"
          ? scope === "friends" ? "Najbolji današnji rezultat tvojih prijatelja (isti slogovi za sve)." : scope === "daily" ? "Najbolji rezultat svih igrača danas." : scope === "weekly" ? "Najbolji rezultat ovaj tjedan (od ponedjeljka)." : "High score svih vremena: najbolja pojedinačna partija."
          : scope === "friends" ? "High score tvojih prijatelja u trening ligi (svaka partija ima nove slogove)." : scope === "daily" ? "Najbolja trening partija svih igrača danas." : scope === "weekly" ? "Najbolja trening partija ovaj tjedan (od ponedjeljka)." : "High score svih vremena u trening ligi."}
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
          {played && scope !== "daily" && !(scope === "friends" && league === "daily") ? "Još nisi na ovoj ljestvici." : (
            <>
              <Link href={league === "daily" ? "/igra" : "/trening"} className="font-bold text-ink underline underline-offset-2">Odigraj partiju</Link> da se pojaviš ovdje.
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
