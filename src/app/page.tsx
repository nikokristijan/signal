"use client";

import Link from "next/link";
import { Clock, Flame, Star } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Countdown } from "@/components/Countdown";
import { useGame } from "@/components/GameProvider";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { Loading, Page } from "@/components/Page";

export default function HomePage() {
  const { ready, profile, challenge, attempt, stats } = useGame();

  if (!ready) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }
  if (!profile) {
    return (
      <Page>
        <AuthGate />
      </Page>
    );
  }

  const finished = attempt && attempt.status !== "playing";
  const inProgress = attempt && attempt.status === "playing";

  return (
    <Page>
      <div className="text-center">
        <p className="label" data-testid="challenge-number">
          Challenge No. {challenge?.number}
        </p>
        <h1 className="mt-2 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Daily Zoom Challenge</h1>
        <p className="mt-3 text-lg text-muted">Can you recognize what you&apos;re looking at?</p>

        <Link href="/play" className="btn-primary btn-lg mt-7 w-full sm:w-auto" data-testid="play">
          {finished ? "See today's result" : inProgress ? "Continue today's challenge" : "Play today's challenge"}
        </Link>
        {finished && (
          <p className="mt-3 text-sm text-muted">
            You scored <strong className="text-ink">{attempt.score}</strong> today. Come back tomorrow!
          </p>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 text-center">
        <div className="tile px-3 py-3">
          <p className="label flex items-center justify-center gap-1">
            <Flame size={14} aria-hidden /> Streak
          </p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid="streak">
            {stats.currentStreak}
          </p>
          <p className="text-xs text-muted">{stats.currentStreak === 1 ? "day" : "days"}</p>
        </div>
        <div className="tile px-3 py-3">
          <p className="label flex items-center justify-center gap-1">
            <Star size={14} aria-hidden /> Total points
          </p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid="total-points">
            {stats.totalPoints.toLocaleString()}
          </p>
          <p className="text-xs text-muted">all time</p>
        </div>
      </div>

      <div className="mt-4">
        <LeaderboardPreview />
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted">
        <Clock size={15} aria-hidden /> {finished ? "Next challenge in" : "New challenge in"} <Countdown className="font-semibold text-ink" />
      </p>
    </Page>
  );
}
