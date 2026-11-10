"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useGame } from "@/components/GameProvider";
import { Loading, Page } from "@/components/Page";
import { formatLongDate } from "@/lib/game/dates";
import { STAGE_COUNT } from "@/lib/game/scoring";
import type { HistoryEntry } from "@/lib/game/types";

function Tile({ label, value, sub, testid }: { label: string; value: string; sub?: string; testid: string }) {
  return (
    <div className="tile px-3 py-3 text-center">
      <p className="label">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid={testid}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const { ready, repo, profile, stats, attempt } = useGame();
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (!repo || !profile) return;
    let off = false;
    void repo.listHistory().then((h) => !off && setHistory(h));
    return () => {
      off = true;
    };
  }, [repo, profile, attempt?.status]);

  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;

  const maxBar = Math.max(1, ...stats.stageDistribution);

  return (
    <Page>
      <h1 className="text-3xl font-extrabold tracking-tight">Statistika</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Ukupno bodova" value={stats.totalPoints.toLocaleString("hr-HR")} testid="stat-total" />
        <Tile label="Dnevni niz" value={String(stats.currentStreak)} sub={`najbolji ${stats.longestStreak}`} testid="stat-streak" />
        <Tile label="Prosj. zoom" value={stats.averageStage === null ? "—" : stats.averageStage.toFixed(1)} sub={`od ${STAGE_COUNT}`} testid="stat-avg-stage" />
        <Tile label="Točno" value={`${stats.correctPercent}%`} sub={`riješeno: ${stats.solved}`} testid="stat-correct" />
        <Tile label="Najbolji dan" value={String(stats.bestScore)} testid="stat-best" />
        <Tile label="Odigrano" value={String(stats.completed)} sub="izazova" testid="stat-completed" />
      </div>

      <section className="tile mt-4 px-4 py-4" aria-labelledby="dist">
        <h2 id="dist" className="label">
          Riješeno na razini zooma
        </h2>
        <ul className="mt-3 space-y-1.5">
          {stats.stageDistribution.map((n, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="w-3 font-semibold tabular-nums">{i + 1}</span>
              <span className="h-5 flex-1 rounded-sm bg-soft">
                <span className="flex h-5 items-center justify-end rounded-sm bg-signal px-1.5 text-xs font-bold text-white" style={{ width: `${Math.max(n ? 8 : 0, (n / maxBar) * 100)}%` }}>
                  {n > 0 ? n : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="mt-8 text-xl font-bold">Povijest</h2>
      {history === null ? (
        <Loading />
      ) : history.length === 0 ? (
        <p className="tile mt-3 px-4 py-8 text-center text-muted">
          Još nema odigranih izazova. <Link href="/play" className="font-semibold text-ink underline underline-offset-2">Odigraj današnji</Link>.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" data-testid="history">
          {history.map((h) => (
            <li key={h.challengeId} className="tile flex items-center gap-3 p-2.5" data-testid="history-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={h.image} alt="" className="h-14 w-[72px] shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{h.subject}</p>
                <p className="text-xs text-muted">
                  br. {h.number} · {formatLongDate(h.date)} · {h.status === "solved" ? `zoom ${h.solvedStage}/${STAGE_COUNT}` : "odustao/la"}
                  {h.wrongCount ? ` · krivo: ${h.wrongCount}` : ""}
                </p>
              </div>
              <p className={`text-lg font-extrabold tabular-nums ${h.status === "solved" ? "text-signal-dark" : "text-muted"}`}>{h.score}</p>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
