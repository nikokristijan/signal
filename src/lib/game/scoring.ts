import type { Attempt } from "./types";

export const STAGE_COUNT = 5;
/** Points available when the answer is found at stage 1..5. */
export const STAGE_POINTS = [500, 400, 300, 200, 100] as const;
export const WRONG_PENALTY = 50;

export function stagePoints(stage: number): number {
  const i = Math.min(Math.max(stage, 1), STAGE_COUNT) - 1;
  return STAGE_POINTS[i];
}

/** Points the player would earn right now: stage value minus penalties, never below zero. */
export function currentScore(stage: number, wrongCount: number): number {
  return Math.max(0, stagePoints(stage) - wrongCount * WRONG_PENALTY);
}

export function newAttempt(challenge: { id: string; date: string; number: number }, now = new Date()): Attempt {
  return {
    challengeId: challenge.id,
    date: challenge.date,
    number: challenge.number,
    stage: 1,
    guesses: [],
    wrongCount: 0,
    status: "playing",
    score: currentScore(1, 0),
    solvedStage: null,
    startedAt: now.toISOString(),
    finishedAt: null,
  };
}
