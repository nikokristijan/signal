"use client";

import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useBomb } from "@/components/BombProvider";
import { Loading, Page } from "@/components/Page";
import { formatDate } from "@/lib/game/dates";
import { wordsLabel } from "@/lib/game/share";

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
  const { ready, profile, stats, results } = useBomb();
  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;
  const history = results.filter((r) => r.mode === "daily");

  return (
    <Page>
      <h1 className="text-3xl font-extrabold tracking-tight">Statistika</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Niz dana" value={String(stats.currentStreak)} sub={`najduži ${stats.longestStreak}`} testid="stat-streak" />
        <Tile label="Najbolji" value={String(stats.bestScore)} sub="bodova" testid="stat-best" />
        <Tile label="Prosjek" value={String(stats.averageScore)} sub="bodova po partiji" testid="stat-average" />
        <Tile label="Odigrano" value={String(stats.played)} sub={stats.played === 1 ? "partija" : "partija"} testid="stat-played" />
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
          Još nema odigranih partija. <Link href="/igra" className="font-bold text-ink underline underline-offset-2">Odigraj današnju</Link>.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" data-testid="history">
          {history.map((h) => (
            <li key={h.date} className="tile flex items-center gap-3 px-4 py-3" data-testid="history-row">
              <div className="min-w-0 flex-1">
                <p className="font-bold">Bomba #{h.number}</p>
                <p className="text-xs text-muted">
                  {formatDate(h.date)} · {h.words} {wordsLabel(h.words)} · combo ×{h.maxCombo}
                  {h.longest ? ` · „${h.longest}"` : ""}
                </p>
              </div>
              <p className="text-xl font-extrabold tabular-nums text-signal">{h.score}</p>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
