import type { Dictionary } from "../dict/dictionary";
import { resolveWord } from "../dict/resolve";
import {
  ELAPSED_SLACK_MS,
  MAX_LOG_ENTRIES,
  MIN_TYPING_MS_BASE,
  MIN_TYPING_MS_PER_CHAR,
} from "./constants";
import { applyBoom, applyWord, initialState, timeLimitMs } from "./rules";
import { syllableAt } from "./syllables";
import type { GameState, GameSummary, LogEntry, Result } from "./types";

export interface Replayed {
  state: GameState;
  summary: GameSummary;
}

export function summarize(state: GameState, log: readonly LogEntry[]): GameSummary {
  return {
    score: state.score,
    words: state.successes,
    maxCombo: state.maxCombo,
    longest: state.longest,
    wordList: state.words.map((w) => w.word),
    booms: state.booms,
    durationMs: log.reduce((s, e) => s + e.t, 0),
  };
}

/** Najmanje vrijeme koje je moguće potrošiti na upis riječi te duljine. */
export function minTypingMs(length: number): number {
  return Math.max(MIN_TYPING_MS_BASE, MIN_TYPING_MS_PER_CHAR * length);
}

export interface ReplayOptions {
  /** Ranglirana partija mora završiti (0 života). Za nastavak prekinute partije stavi false. */
  requireOver?: boolean;
  /** Provjere protiv botova (minimalno vrijeme tipkanja). Isključi samo za rekonstrukciju vlastitog stanja. */
  strict?: boolean;
}

/**
 * Ponovno odigra partiju iz zapisa: provjerava seed (slogove), rječnik, slog, ponavljanja i vremena,
 * pa SAM izračuna bodove. Klijent nikad ne šalje bodove, samo zapis.
 */
export function replayLog(seed: string, log: readonly LogEntry[], dict: Dictionary, opts: ReplayOptions = {}): Result<Replayed> {
  const { requireOver = true, strict = true } = opts;
  if (!Array.isArray(log)) return { ok: false, error: "Zapis nije popis" };
  if (log.length > MAX_LOG_ENTRIES) return { ok: false, error: "Zapis je predug" };

  let state = initialState();
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    const where = `korak ${i + 1}`;
    if (!e || typeof e.t !== "number" || !Number.isInteger(e.t) || e.t < 0) return { ok: false, error: `${where}: neispravno vrijeme` };
    if (e.w !== null && typeof e.w !== "string") return { ok: false, error: `${where}: neispravna riječ` };
    if (state.over) return { ok: false, error: `${where}: zapis se nastavlja nakon kraja igre` };

    const syllable = syllableAt(seed, state.step);
    const limit = timeLimitMs(state);

    if (e.w === null) {
      if (e.t !== limit) return { ok: false, error: `${where}: eksplozija nije u trenutku isteka tajmera` };
      state = applyBoom(state);
      continue;
    }

    if (e.t >= limit) return { ok: false, error: `${where}: odgovor nakon isteka tajmera` };
    const res = resolveWord(dict, e.w, syllable, state.used);
    if (!res.ok) return { ok: false, error: `${where}: riječ nije valjana (${res.reason})` };
    if (strict && e.t < minTypingMs(res.word.length)) return { ok: false, error: `${where}: prebrzo za ljudski unos` };
    state = applyWord(state, syllable, res.word, e.t).state;
  }

  if (requireOver && !state.over) return { ok: false, error: "Partija nije završena" };
  return { ok: true, value: { state, summary: summarize(state, log) } };
}

/** Zapis ne smije obuhvaćati više vremena nego što je stvarno proteklo od starta partije. */
export function checkElapsed(durationMs: number, startedAtMs: number, nowMs: number): Result<true> {
  if (nowMs < startedAtMs) return { ok: false, error: "Neispravno vrijeme starta" };
  if (durationMs > nowMs - startedAtMs + ELAPSED_SLACK_MS) return { ok: false, error: "Zapis traje dulje nego što je partija stvarno trajala" };
  return { ok: true, value: true };
}
