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
      <h1 className="text-3xl font-extrabold tracking-tight">Statistics</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Total points" value={stats.totalPoints.toLocaleString()} testid="stat-total" />
        <Tile label="Daily streak" value={String(stats.currentStreak)} sub={`best ${stats.longestStreak}`} testid="stat-streak" />
        <Tile label="Avg. stage" value={stats.averageStage === null ? "—" : stats.averageStage.toFixed(1)} sub={`of ${STAGE_COUNT}`} testid="stat-avg-stage" />
        <Tile label="Correct" value={`${stats.correctPercent}%`} sub={`${stats.solved} solved`} testid="stat-correct" />
        <Tile label="Best daily score" value={String(stats.bestScore)} testid="stat-best" />
        <Tile label="Completed" value={String(stats.completed)} sub="challenges" testid="stat-completed" />
      </div>

      <section className="tile mt-4 px-4 py-4" aria-labelledby="dist">
        <h2 id="dist" className="label">
          Solved at zoom stage
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

      <h2 className="mt-8 text-xl font-bold">History</h2>
      {history === null ? (
        <Loading />
      ) : history.length === 0 ? (
        <p className="tile mt-3 px-4 py-8 text-center text-muted">
          No finished challenges yet. <Link href="/play" className="font-semibold text-ink underline underline-offset-2">Play today&apos;s</Link>.
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
                  No. {h.number} · {formatLongDate(h.date)} · {h.status === "solved" ? `zoom ${h.solvedStage}/${STAGE_COUNT}` : "gave up"}
                  {h.wrongCount ? ` · ${h.wrongCount} wrong` : ""}
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
