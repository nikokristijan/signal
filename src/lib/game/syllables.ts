import data from "../data/slogovi.json";
import { hashSeed, mulberry32 } from "./rng";

export type Tier = "lako" | "srednje" | "tesko";

const POOL: Record<Tier, string[]> = data.slogovi;

/**
 * Težina raste kroz partiju: prvo česti slogovi, kasnije rjeđi.
 * Vraća vjerojatnosti [lako, srednje, tesko] za slog s danim indeksom.
 */
export function tierWeights(step: number): [number, number, number] {
  if (step < 5) return [1, 0, 0];
  if (step < 10) return [0.6, 0.4, 0];
  if (step < 20) return [0.3, 0.5, 0.2];
  if (step < 35) return [0.15, 0.45, 0.4];
  return [0.1, 0.35, 0.55];
}

/** Isti slog se ne smije ponoviti unutar zadnjih toliko koraka. */
const NO_REPEAT_WINDOW = 12;

interface Sequence {
  rng: () => number;
  list: string[];
}

const cache = new Map<string, Sequence>();

function pick(rng: () => number, step: number): string {
  const [pl, pm] = tierWeights(step);
  const r = rng();
  const tier: Tier = r < pl ? "lako" : r < pl + pm ? "srednje" : "tesko";
  const list = POOL[tier];
  return list[Math.floor(rng() * list.length)];
}

function extend(seq: Sequence, length: number) {
  while (seq.list.length < length) {
    const step = seq.list.length;
    const recent = seq.list.slice(-NO_REPEAT_WINDOW);
    let s = pick(seq.rng, step);
    for (let tries = 0; tries < 30 && recent.includes(s); tries++) s = pick(seq.rng, step);
    seq.list.push(s);
  }
}

/**
 * Niz slogova za dani seed. Potpuno deterministički i „prefiksno stabilan":
 * prvih k slogova isti su bez obzira koliko ih ukupno tražiš.
 */
export function generateSyllables(seed: string, count: number): string[] {
  let seq = cache.get(seed);
  if (!seq) {
    seq = { rng: mulberry32(hashSeed(seed)), list: [] };
    cache.set(seed, seq);
    if (cache.size > 50) cache.delete(cache.keys().next().value as string);
  }
  extend(seq, count);
  return seq.list.slice(0, count);
}

export function syllableAt(seed: string, index: number): string {
  const seq = cache.get(seed);
  if (seq && seq.list.length > index) return seq.list[index];
  return generateSyllables(seed, Math.max(index + 1, 64))[index];
}
