"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Clock, RotateCcw, Share2, Trophy } from "lucide-react";
import { shareText, wordsLabel } from "@/lib/game/share";
import type { FinishInfo, GameResult, LeaderboardEntry } from "@/lib/game/types";
import { useBomb } from "./BombProvider";
import { Countdown } from "./Countdown";
import { LeaderboardTable } from "./LeaderboardTable";

interface Props {
  result: GameResult;
  /** Samo za dnevne partije. */
  info: FinishInfo | null;
  onAgain: () => void;
}

export function ResultPanel({ result, info, onAgain }: Props) {
  const { repo, today } = useBomb();
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<LeaderboardEntry[] | null>(null);
  const daily = result.mode === "daily";

  useEffect(() => {
    if (!repo || !daily) return;
    let off = false;
    void repo.getLeaderboard("friends", today).then((r) => !off && setFriends(r));
    return () => {
      off = true;
    };
  }, [repo, today, daily, result.id]);

  async function share() {
    const text = shareText(result, window.location.origin);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return; // korisnik je odustao
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard nije dostupan */
    }
  }

  return (
    <section className="animate-fade-up px-4 pb-10 pt-6 text-center" data-testid="result" data-mode={result.mode}>
      <p className="label">{daily ? `Bomba #${result.number} · kraj partije` : "Trening · kraj partije"}</p>
      <p className="mt-2 text-6xl font-extrabold tabular-nums text-ink" data-testid="final-score">
        {result.score}
      </p>
      <p className="label mt-1">bodova</p>

      {daily && info && (
        <div className="mt-3 flex min-h-[28px] justify-center" data-testid="best-info">
          {info.allTimeBest && info.result.score > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-tint px-3 py-1 text-sm font-semibold text-signal-dark" data-testid="badge-highscore">
              <Trophy size={15} aria-hidden /> Novi high score!
            </span>
          ) : info.dayBest && info.result.score > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-tint px-3 py-1 text-sm font-semibold text-signal-dark" data-testid="badge-daybest">
              <Check size={15} aria-hidden /> Novi najbolji rezultat danas
            </span>
          ) : (
            <span className="text-sm text-muted" data-testid="best-today">
              Najbolje danas: <b className="text-ink">{info.bestToday}</b>
            </span>
          )}
        </div>
      )}

      <dl className="mt-5 grid grid-cols-3 gap-2">
        <div className="tile px-2 py-3">
          <dt className="label">Riječi</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums" data-testid="final-words">
            {result.words}
          </dd>
          <dd className="text-[11px] text-muted">{wordsLabel(result.words)}</dd>
        </div>
        <div className="tile px-2 py-3">
          <dt className="label">Combo</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums" data-testid="final-combo">
            ×{result.maxCombo}
          </dd>
          <dd className="text-[11px] text-muted">najbolji</dd>
        </div>
        <div className="tile px-2 py-3">
          <dt className="label">Najduža</dt>
          <dd className="mt-1 truncate text-base font-extrabold" data-testid="final-longest">
            {result.longest || "—"}
          </dd>
          <dd className="text-[11px] text-muted">{result.longest ? `${result.longest.length} slova` : ""}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-col gap-2">
        <button className="btn-primary btn-lg w-full" onClick={onAgain} data-testid="again">
          <RotateCcw size={18} aria-hidden /> Igraj ponovno
        </button>
        {daily ? (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={share} data-testid="share">
              {copied ? <Check size={18} aria-hidden /> : <Share2 size={18} aria-hidden />}
              {copied ? "Kopirano" : "Podijeli"}
            </button>
            <Link href="/ljestvica" className="btn-ghost" data-testid="view-leaderboard">
              <Trophy size={18} aria-hidden /> Ljestvica
            </Link>
          </div>
        ) : (
          <Link href="/" className="btn-ghost">
            Početna
          </Link>
        )}
      </div>

      {daily && (
        <div className="mt-6 text-left">
          <h2 className="label mb-2">Prijatelji danas (najbolji rezultat)</h2>
          {friends === null ? null : friends.length <= 1 ? (
            <p className="tile px-4 py-4 text-sm text-muted">
              Još nema prijatelja s današnjim rezultatom.{" "}
              <Link href="/prijatelji" className="font-semibold text-ink underline underline-offset-2">
                Dodaj prijatelje
              </Link>
              .
            </p>
          ) : (
            <LeaderboardTable rows={friends} limit={5} />
          )}
        </div>
      )}

      {daily && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted">
          <Clock size={15} aria-hidden /> Novi niz slogova za <Countdown className="font-semibold text-ink" />
        </p>
      )}
    </section>
  );
}
