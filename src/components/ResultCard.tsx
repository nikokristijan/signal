"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Clock, Share2, Trophy } from "lucide-react";
import { STAGE_COUNT, WRONG_PENALTY } from "@/lib/game/scoring";
import { shareText } from "@/lib/game/share";
import type { Attempt, Reveal } from "@/lib/game/types";
import { Countdown } from "./Countdown";

export function ResultCard({ attempt, reveal }: { attempt: Attempt; reveal: Reveal | null }) {
  const [copied, setCopied] = useState(false);
  const solved = attempt.status === "solved";

  async function share() {
    const text = shareText(attempt, typeof window !== "undefined" ? window.location.origin : undefined);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return; // user cancelled
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="animate-fade-up mt-5 text-center" aria-live="polite" data-testid="result" data-status={attempt.status}>
      {solved ? (
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-signal-dark">
          <Check size={18} aria-hidden /> Correct
        </p>
      ) : (
        <p className="label">Today&apos;s answer</p>
      )}
      <h2 className="mt-1 text-3xl font-extrabold tracking-tight" data-testid="answer">
        {reveal?.subject ?? "…"}
      </h2>

      <div className="mt-4 rounded-lg border border-line bg-white px-4 py-4">
        <p className="text-5xl font-extrabold tabular-nums" data-testid="final-score">
          {attempt.score}
        </p>
        <p className="label mt-1">points</p>
        <p className="mt-3 text-sm text-muted" data-testid="result-summary">
          {solved
            ? `Solved at zoom ${attempt.solvedStage} of ${STAGE_COUNT}${
                attempt.wrongCount ? ` · ${attempt.wrongCount} wrong ${attempt.wrongCount === 1 ? "guess" : "guesses"} (−${attempt.wrongCount * WRONG_PENALTY})` : " · no wrong guesses"
              }`
            : "You gave up, so no points this time. Back tomorrow!"}
        </p>
      </div>

      {reveal && (
        <p className="mt-4 text-sm leading-relaxed text-ink/80">
          {reveal.fact}
          <span className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <Chip>{reveal.category}</Chip>
            <Chip>{reveal.difficulty}</Chip>
          </span>
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link href="/leaderboard" className="btn-primary flex-1" data-testid="view-leaderboard">
          <Trophy size={18} aria-hidden /> View leaderboard
        </Link>
        <button className="btn-secondary flex-1" onClick={share} data-testid="share">
          {copied ? <Check size={18} aria-hidden /> : <Share2 size={18} aria-hidden />}
          {copied ? "Copied" : "Share result"}
        </button>
      </div>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted">
        <Clock size={15} aria-hidden /> Next challenge in <Countdown className="font-semibold text-ink" />
      </p>

      {reveal && (
        <p className="mt-4 text-[11px] leading-snug text-muted">
          Photo: {reveal.credit.author || "Unknown"} · {reveal.credit.license} ·{" "}
          <a className="underline underline-offset-2" href={reveal.credit.page} target="_blank" rel="noreferrer">
            Wikimedia Commons
          </a>
        </p>
      )}
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-medium capitalize text-muted">{children}</span>;
}
