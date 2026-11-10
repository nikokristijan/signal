import type { Verdict } from "./types";

/** Lowercase, strip accents/punctuation, drop leading articles, light plural stemming. */
export function normalize(input: string): string {
  const base = input
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = base.split(" ").filter(Boolean);
  while (tokens.length > 1 && ["the", "a", "an"].includes(tokens[0])) tokens.shift();
  // Same stemming is applied to candidates and guesses, so "zebras" == "zebra".
  return tokens.map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t)).join(" ");
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Typos are forgiven only for longer answers so short words stay unambiguous. */
function tolerance(candidate: string): number {
  if (candidate.length >= 12) return 2;
  if (candidate.length >= 6) return 1;
  return 0;
}

export function matches(guess: string, candidate: string): boolean {
  const g = normalize(guess);
  const c = normalize(candidate);
  if (!g || !c) return false;
  return g === c || editDistance(g, c) <= tolerance(c);
}

export interface AnswerKey {
  answer: string;
  alternatives: string[];
  nudges: string[];
}

export function judgeGuess(guess: string, key: AnswerKey): Extract<Verdict, "correct" | "close" | "wrong" | "empty"> {
  if (!normalize(guess)) return "empty";
  if ([key.answer, ...key.alternatives].some((c) => matches(guess, c))) return "correct";
  if (key.nudges.some((n) => normalize(n) === normalize(guess))) return "close";
  return "wrong";
}
