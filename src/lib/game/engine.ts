import { judgeGuess, normalize, type AnswerKey } from "./answers";
import { STAGE_COUNT, currentScore } from "./scoring";
import type { Attempt, GuessOutcome } from "./types";

/**
 * Pure state transitions for one attempt. The local adapter runs these in the
 * browser; the Supabase adapter mirrors the same rules in SQL (see supabase/migrations).
 */

export function applyGuess(attempt: Attempt, key: AnswerKey, text: string, now = new Date()): GuessOutcome {
  if (attempt.status !== "playing") return { verdict: "duplicate", attempt, penalty: 0 };
  const trimmed = text.trim();
  const verdict = judgeGuess(trimmed, key);
  if (verdict === "empty") return { verdict, attempt, penalty: 0 };

  // Repeating a guess you already made costs nothing.
  if (attempt.guesses.some((g) => normalize(g.text) === normalize(trimmed))) {
    return { verdict: "duplicate", attempt, penalty: 0 };
  }
  if (verdict === "close") return { verdict, attempt, penalty: 0 };

  if (verdict === "correct") {
    const next: Attempt = {
      ...attempt,
      guesses: [...attempt.guesses, { text: trimmed, stage: attempt.stage, correct: true }],
      status: "solved",
      solvedStage: attempt.stage,
      score: currentScore(attempt.stage, attempt.wrongCount),
      finishedAt: now.toISOString(),
    };
    return { verdict, attempt: next, penalty: 0 };
  }

  const wrongCount = attempt.wrongCount + 1;
  const before = currentScore(attempt.stage, attempt.wrongCount);
  const after = currentScore(attempt.stage, wrongCount);
  return {
    verdict: "wrong",
    penalty: before - after,
    attempt: {
      ...attempt,
      guesses: [...attempt.guesses, { text: trimmed, stage: attempt.stage, correct: false }],
      wrongCount,
      score: after,
    },
  };
}

export function applyReveal(attempt: Attempt): Attempt {
  if (attempt.status !== "playing" || attempt.stage >= STAGE_COUNT) return attempt;
  const stage = attempt.stage + 1;
  return { ...attempt, stage, score: currentScore(stage, attempt.wrongCount) };
}

export function applyGiveUp(attempt: Attempt, now = new Date()): Attempt {
  if (attempt.status !== "playing") return attempt;
  return { ...attempt, status: "gave_up", score: 0, solvedStage: null, stage: STAGE_COUNT, finishedAt: now.toISOString() };
}
