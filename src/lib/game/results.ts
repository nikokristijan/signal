import type { GameResult } from "./types";

/** Bolja partija: više bodova, pri jednakosti više riječi, pri jednakosti ranija. */
export function better(a: GameResult, b: GameResult): boolean {
  return a.score > b.score || (a.score === b.score && (a.words > b.words || (a.words === b.words && a.finishedAt < b.finishedAt)));
}

/** Najbolja partija (high score) iz popisa, ili null. */
export function bestOf(games: readonly GameResult[]): GameResult | null {
  let best: GameResult | null = null;
  for (const g of games) if (!best || better(g, best)) best = g;
  return best;
}
