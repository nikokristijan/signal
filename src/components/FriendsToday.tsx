"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { FriendEntry } from "@/lib/game/types";
import { Avatar } from "./Avatar";
import { useBomb } from "./BombProvider";

/** Pregled prijatelja na početnoj: tko je danas već odigrao i s kojim rezultatom. */
export function FriendsToday() {
  const { repo, today, daily } = useBomb();
  const [rows, setRows] = useState<FriendEntry[] | null>(null);

  useEffect(() => {
    if (!repo) return;
    let off = false;
    void repo.listFriends(today).then((r) => !off && setRows(r));
    return () => {
      off = true;
    };
  }, [repo, today, daily?.state]);

  const sorted = rows ? [...rows].sort((a, b) => (b.todayScore ?? -1) - (a.todayScore ?? -1) || b.totalScore - a.totalScore) : null;

  return (
    <section aria-labelledby="fr-h" className="tile text-left" data-testid="friends-today">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 id="fr-h" className="label">Prijatelji danas</h2>
        <Link href="/ljestvica" className="inline-flex items-center text-sm font-bold text-signal hover:underline">
          Ljestvica <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {sorted === null ? (
        <div className="h-24" />
      ) : sorted.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">
          Još nemaš prijatelja. <Link href="/prijatelji" className="font-bold text-ink underline underline-offset-2">Dodaj ih</Link> pa usporedite rezultate.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-line/70">
          {sorted.slice(0, 5).map((f) => (
            <li key={f.userId} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar username={f.username} avatar={f.avatar} size={28} />
              <span className="min-w-0 flex-1 truncate font-semibold">{f.username}</span>
              {f.todayScore === null ? (
                <span className="text-xs font-semibold text-muted">još nije igrao</span>
              ) : (
                <span className="text-right">
                  <span className="font-extrabold tabular-nums">{f.todayScore}</span>
                  <span className="ml-1.5 text-xs text-muted">{f.todayWords} r.</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows?.some((r) => r.simulated) && <p className="px-4 pb-3 pt-1 text-[11px] text-muted">Demo način: prijatelji su simulirani.</p>}
    </section>
  );
}
