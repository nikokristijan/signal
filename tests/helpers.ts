import fs from "node:fs";
import path from "node:path";
import { Dictionary } from "@/lib/dict/dictionary";
import { fold } from "@/lib/dict/fold";
import { resolveWord } from "@/lib/dict/resolve";
import { applyBoom, applyWord, initialState, timeLimitMs } from "@/lib/game/rules";
import { syllableAt } from "@/lib/game/syllables";
import type { GameState, LogEntry } from "@/lib/game/types";

export const dict = Dictionary.fromGzip(new Uint8Array(fs.readFileSync(path.join(__dirname, "../public/dict/hr.bin.gz"))));

/** Svi oblici za brzo traženje riječi koje sadrže slog (samo u testovima; dekodira cijeli rječnik jednom). */
let all: string[] | null = null;
export function allWords(): string[] {
  if (!all) {
    all = [];
    // Dekodiranje svih blokova preko lookupFold nije praktično; čitamo front-coded izravno.
    const ALPHA = "abcdefghijklmnopqrstuvwxyzčćšžđ";
    const buf = require("fflate").gunzipSync(new Uint8Array(fs.readFileSync(path.join(__dirname, "../public/dict/hr.bin.gz")))) as Uint8Array;
    const view = new DataView(buf.buffer, buf.byteOffset);
    const n = view.getUint32(4, true);
    const bs = view.getUint16(8, true);
    let p = 12;
    let prev = "";
    for (let i = 0; i < n; i++) {
      if (i % bs === 0) prev = "";
      const l = buf[p++];
      const len = buf[p++];
      let w = prev.slice(0, l);
      for (let j = 0; j < len; j++) w += ALPHA[buf[p++] - 1];
      all.push(w);
      prev = w;
    }
  }
  return all;
}

/** Prva neiskorištena riječ s ≥ minLen slova koja sadrži slog. */
export function wordFor(syllable: string, used: readonly string[], minLen = 5): string {
  const set = new Set(used);
  const w = allWords().find((x) => x.length >= minLen && x.includes(syllable) && !set.has(x) && /^[a-zčćšžđ]+$/.test(x));
  if (!w) throw new Error("nema riječi za slog " + syllable);
  return w;
}

/**
 * Generira VALJAN zapis partije: `answers` točnih riječi, pa eksplozije dok ne ostane 0 života.
 * ms = vrijeme svakog odgovora (zadano 2500 ms, tj. sporo, bez comboa).
 */
export function playLog(seed: string, answers: number, ms = 2500): { log: LogEntry[]; state: GameState } {
  let state = initialState();
  const log: LogEntry[] = [];
  for (let i = 0; i < answers; i++) {
    const syl = syllableAt(seed, state.step);
    const word = wordFor(syl, state.used);
    const r = resolveWord(dict, word, syl, state.used);
    if (!r.ok) throw new Error("test: " + word + " " + r.reason);
    log.push({ w: word, t: Math.max(ms, 400 + word.length * 40) });
    state = applyWord(state, syl, r.word, log[log.length - 1].t).state;
  }
  while (!state.over) {
    log.push({ w: null, t: timeLimitMs(state) });
    state = applyBoom(state);
  }
  return { log, state };
}

export { fold };
