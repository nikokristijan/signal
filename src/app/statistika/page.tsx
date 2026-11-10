"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useBomb } from "@/components/BombProvider";
import { LeagueToggle } from "@/components/LeagueToggle";
import { Loading, Page } from "@/components/Page";
import type { Mode } from "@/lib/game/constants";
import { formatDate } from "@/lib/game/dates";
import { wordsLabel } from "@/lib/game/share";
import { better } from "@/lib/game/results";

function Tile({ label, value, sub, testid }: { label: string; value: string; sub?: string; testid: string }) {
  return (
    <div className="tile px-3 py-3 text-center">
      <p className="label">{label}</p>
      <p className="mt-1 truncate text-3xl font-extrabold tabular-nums" data-testid={testid}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const { ready, profile, stats: dailyStats, trainingStats, results } = useBomb();
  const [league, setLeague] = useState<Mode>("daily");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("liga") === "trening") setLeague("training");
  }, []);
  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;
  const stats = league === "daily" ? dailyStats : trainingStats;
  const history = results.filter((r) => r.mode === league);
  // najbolja partija svakog dana (high score tog dana)
  const dayBest = new Map<string, string>();
  const bestByDate = new Map<string, (typeof history)[number]>();
  for (const g of history) {
    const cur = bestByDate.get(g.date);
    if (!cur || better(g, cur)) bestByDate.set(g.date, g);
  }
  for (const [date, g] of bestByDate) dayBest.set(date, g.id);

  return (
    <Page>
      <h1 className="text-3xl font-extrabold tracking-tight">Statistika</h1>
      <div className="mt-4"><LeagueToggle value={league} onChange={setLeague} /></div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {league === "daily" && <Tile label="Niz dana" value={String(stats.currentStreak)} sub={`najduži ${stats.longestStreak}`} testid="stat-streak" />}
        <Tile label="High score" value={String(stats.bestScore)} sub="najbolja partija" testid="stat-best" />
        <Tile label="Prosjek" value={String(stats.averageScore)} sub="bodova po partiji" testid="stat-average" />
        <Tile label="Partija" value={String(stats.played)} sub="ukupno odigrano" testid="stat-played" />
        <Tile label="Riječi" value={String(stats.totalWords)} sub="ukupno" testid="stat-words" />
        <Tile label="Combo" value={`×${stats.bestCombo}`} sub="najbolji" testid="stat-combo" />
      </div>
      {stats.longest && (
        <p className="tile mt-3 px-4 py-3 text-center text-sm text-muted">
          Najduža riječ: <b className="text-ink">{stats.longest}</b> ({stats.longest.length} slova)
        </p>
      )}

      <h2 className="mt-8 text-xl font-extrabold">Povijest</h2>
      {history.length === 0 ? (
        <p className="tile mt-3 px-4 py-8 text-center text-muted">
          Još nema odigranih partija. <Link href={league === "daily" ? "/igra" : "/trening"} className="font-bold text-ink underline underline-offset-2">Odigraj partiju</Link>.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" data-testid="history">
          {history.map((h) => (
            <li key={h.id} className="tile flex items-center gap-3 px-4 py-3" data-testid="history-row" data-daybest={dayBest.get(h.date) === h.id ? "true" : undefined}>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {league === "daily" ? `Dnevna liga #${h.number}` : "Trening liga"}
                  {dayBest.get(h.date) === h.id && <span className="ml-2 rounded-full bg-signal-tint px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-signal-dark">najbolji dana</span>}
                </p>
                <p className="text-xs text-muted">
                  {formatDate(h.date)} · {h.words} {wordsLabel(h.words)} · combo ×{h.maxCombo}
                  {h.longest ? ` · „${h.longest}"` : ""}
                </p>
              </div>
              <p className="text-xl font-extrabold tabular-nums text-ink">{h.score}</p>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
