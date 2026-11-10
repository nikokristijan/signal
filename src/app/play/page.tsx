"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useGame } from "@/components/GameProvider";
import { GuessForm } from "@/components/GuessForm";
import { Loading, Page } from "@/components/Page";
import { ResultCard } from "@/components/ResultCard";
import { StageProgress } from "@/components/StageProgress";
import { ZoomImage } from "@/components/ZoomImage";

export default function PlayPage() {
  const { ready, profile, challenge, attempt, reveal, startToday, guess, revealNext, giveUp } = useGame();

  // Opening the game screen starts today's attempt (once). Progress is persisted by the repository.
  useEffect(() => {
    if (ready && profile && challenge && !attempt) void startToday();
  }, [ready, profile, challenge, attempt, startToday]);

  if (!ready || (profile && (!challenge || !attempt))) {
    return (
      <Page challengeNumber={challenge?.number}>
        <Loading />
      </Page>
    );
  }
  if (!profile || !challenge || !attempt) {
    return (
      <Page>
        <AuthGate />
      </Page>
    );
  }

  const playing = attempt.status === "playing";
  const solved = attempt.status === "solved";

  return (
    <Page challengeNumber={challenge.number}>
      <div className="mb-4">
        <StageProgress stage={attempt.stage} />
      </div>
      {/* Once the game is over (solved or given up) the whole photograph is shown. */}
      <ZoomImage stages={challenge.stages} stage={playing ? attempt.stage : challenge.stages.length} celebrate={solved} />
      {playing ? (
        <GuessForm key={challenge.id} attempt={attempt} onGuess={guess} onReveal={revealNext} onGiveUp={giveUp} />
      ) : (
        <>
          <ResultCard attempt={attempt} reveal={reveal} />
          <p className="mt-6 text-center text-sm">
            <Link href="/stats" className="text-muted underline underline-offset-2 hover:text-ink">
              Pogledaj statistiku i povijest
            </Link>
          </p>
        </>
      )}
    </Page>
  );
}
