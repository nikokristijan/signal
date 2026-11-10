import { STAGE_COUNT } from "./scoring";
import type { Attempt } from "./types";

/** Spoiler-free share text: one square per zoom stage. */
export function shareText(a: Attempt, url?: string): string {
  const squares = Array.from({ length: STAGE_COUNT }, (_, i) => {
    const n = i + 1;
    if (a.solvedStage === n) return "🟩";
    if (n <= a.stage) return "⬛";
    return "⬜";
  }).join("");
  const head = `SIGNAL No. ${a.number}  ${a.solvedStage ? `${a.solvedStage}/${STAGE_COUNT}` : "X/5"}  ${a.score} pts`;
  const misses = a.wrongCount ? `\n❌ × ${a.wrongCount}` : "";
  return `${head}\n${squares}${misses}${url ? `\n${url}` : ""}`;
}
