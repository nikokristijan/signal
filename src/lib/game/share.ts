import type { GameResult } from "./types";

/** Tekst za dijeljenje (bez spoilera: samo brojke i najduža riječ). */
export function shareText(r: Pick<GameResult, "number" | "words" | "score" | "maxCombo" | "longest">, url?: string): string {
  const lines = [`💣 Bomba #${r.number} · ${r.words} ${wordsLabel(r.words)} · ${r.score} bodova`];
  const extra = [r.maxCombo > 0 ? `🔥 combo ×${r.maxCombo}` : "", r.longest ? `najduža: „${r.longest}"` : ""].filter(Boolean);
  if (extra.length) lines.push(extra.join(" · "));
  if (url) lines.push(url);
  return lines.join("\n");
}

/** Hrvatska množina: 1 riječ, 2–4 riječi, 5+ riječi (i 11–14 riječi). */
export function wordsLabel(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m10 === 1 && m100 !== 11) return "riječ";
  return "riječi";
}
