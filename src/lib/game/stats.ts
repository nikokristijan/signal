import { addDays } from "./dates";
import type { GameResult } from "./types";

export interface Stats {
  played: number;
  totalScore: number;
  bestScore: number;
  averageScore: number;
  totalWords: number;
  bestCombo: number;
  longest: string;
  currentStreak: number;
  longestStreak: number;
}

/** Niz dana = uzastopni dani s odigranom dnevnom partijom. Živ je i ako danas još nisi igrao (broji se od jučer). */
export function computeStreaks(dates: readonly string[], today: string): { current: number; longest: number } {
  const set = new Set(dates);
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest: Math.max(longest, current) };
}

export function computeStats(results: readonly GameResult[], today: string): Stats {
  const daily = results.filter((r) => r.mode === "daily");
  const { current, longest } = computeStreaks(
    daily.map((r) => r.date),
    today,
  );
  const totalScore = daily.reduce((s, r) => s + r.score, 0);
  return {
    played: daily.length,
    totalScore,
    bestScore: daily.reduce((m, r) => Math.max(m, r.score), 0),
    averageScore: daily.length ? Math.round(totalScore / daily.length) : 0,
    totalWords: daily.reduce((s, r) => s + r.words, 0),
    bestCombo: daily.reduce((m, r) => Math.max(m, r.maxCombo), 0),
    longest: daily.reduce((l, r) => (r.longest.length > l.length ? r.longest : l), ""),
    currentStreak: current,
    longestStreak: longest,
  };
}
