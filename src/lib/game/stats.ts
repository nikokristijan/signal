import { addDays } from "./dates";
import type { Attempt } from "./types";

export interface Stats {
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  /** Mean stage at which solved challenges were solved, null if none. */
  averageStage: number | null;
  /** 0..100, share of finished challenges that were solved. */
  correctPercent: number;
  bestScore: number;
  completed: number;
  solved: number;
  /** How many challenges were solved at stage 1..5 */
  stageDistribution: number[];
}

export const finished = (a: Attempt) => a.status !== "playing";

/**
 * Streak = consecutive calendar days with a solved challenge.
 * If today isn't finished yet the streak is still alive, counted back from yesterday.
 */
export function computeStreaks(attempts: Attempt[], today: string): { current: number; longest: number } {
  const solvedDays = new Set(attempts.filter((a) => a.status === "solved").map((a) => a.date));
  let current = 0;
  let cursor = solvedDays.has(today) ? today : addDays(today, -1);
  while (solvedDays.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...solvedDays].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  return { current, longest: Math.max(longest, current) };
}

export function computeStats(attempts: Attempt[], today: string): Stats {
  const done = attempts.filter(finished);
  const solved = done.filter((a) => a.status === "solved");
  const { current, longest } = computeStreaks(attempts, today);
  const stageDistribution = [0, 0, 0, 0, 0];
  for (const a of solved) if (a.solvedStage) stageDistribution[a.solvedStage - 1]++;
  return {
    totalPoints: done.reduce((sum, a) => sum + a.score, 0),
    currentStreak: current,
    longestStreak: longest,
    averageStage: solved.length ? solved.reduce((s, a) => s + (a.solvedStage ?? 0), 0) / solved.length : null,
    correctPercent: done.length ? Math.round((solved.length / done.length) * 100) : 0,
    bestScore: done.reduce((m, a) => Math.max(m, a.score), 0),
    completed: done.length,
    solved: solved.length,
    stageDistribution,
  };
}
