"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/game/types";
import { Avatar } from "./Avatar";
import { useGame } from "./GameProvider";

export function LeaderboardPreview() {
  const { repo, today, attempt } = useGame();
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    if (!repo) return;
    let off = false;
    void repo.getLeaderboard("friends", today).then((r) => !off && setRows(r));
    return () => {
      off = true;
    };
  }, [repo, today, attempt?.status]);

  return (
    <section aria-labelledby="friends-heading" className="tile text-left">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 id="friends-heading" className="label">
          Ljestvica prijatelja
        </h2>
        <Link href="/leaderboard" className="inline-flex items-center text-sm font-semibold text-signal-dark hover:underline">
          Sve <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {rows === null ? (
        <div className="h-28" />
      ) : rows.length <= 1 ? (
        <p className="px-4 py-5 text-sm text-muted">
          Još nemaš prijatelja. <Link href="/friends" className="font-semibold text-ink underline underline-offset-2">Dodaj ih</Link> i usporedite bodove.
        </p>
      ) : (
        <ol className="mt-1 divide-y divide-line/70">
          {rows.slice(0, 5).map((r) => (
            <li key={r.userId} className={`flex items-center gap-3 px-4 py-2.5 ${r.isMe ? "bg-signal-tint" : ""}`}>
              <span className="w-5 text-sm font-bold tabular-nums text-muted">{r.rank}</span>
              <Avatar username={r.username} avatar={r.avatar} size={28} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {r.username}
                {r.isMe && <span className="ml-1.5 text-xs font-semibold text-signal-dark">Ti</span>}
              </span>
              <span className="font-bold tabular-nums">{r.points.toLocaleString("hr-HR")}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
