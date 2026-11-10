import { BASE_TIME_S, COMBO_BONUS_CAP, COMBO_POINTS, FAST_BONUS_S, FAST_MS, MIN_TIME_S, START_LIVES, TIME_STEP_S } from "./constants";
import type { GameState } from "./types";

export function initialState(): GameState {
  return {
    step: 0,
    lives: START_LIVES,
    score: 0,
    successes: 0,
    booms: 0,
    combo: 0,
    maxCombo: 0,
    lastFast: false,
    used: [],
    words: [],
    longest: "",
    over: false,
  };
}

/** Koliko ms igrač ima za trenutni slog. */
export function timeLimitMs(state: Pick<GameState, "successes" | "lastFast">): number {
  const base = Math.max(MIN_TIME_S, BASE_TIME_S - TIME_STEP_S * state.successes);
  return Math.round((base + (state.lastFast ? FAST_BONUS_S : 0)) * 1000);
}

/** Bodovi za riječ: duljina² + bonus za combo (samo za brz odgovor). */
export function wordPoints(length: number, combo: number, fast: boolean) {
  const len = length * length;
  const comboBonus = fast ? Math.min(COMBO_POINTS * combo, COMBO_BONUS_CAP) : 0;
  return { length: len, combo: comboBonus, total: len + comboBonus };
}

export interface WordApplied {
  state: GameState;
  points: number;
  fast: boolean;
}

/** Primjenjuje VEĆ PROVJERENU riječ (kanonski oblik) uz vrijeme odgovora u ms. */
export function applyWord(state: GameState, syllable: string, word: string, ms: number): WordApplied {
  const fast = ms < FAST_MS;
  const combo = fast ? state.combo + 1 : 0;
  const pts = wordPoints(word.length, combo, fast);
  return {
    points: pts.total,
    fast,
    state: {
      ...state,
      step: state.step + 1,
      score: state.score + pts.total,
      successes: state.successes + 1,
      combo,
      maxCombo: Math.max(state.maxCombo, combo),
      lastFast: fast,
      used: [...state.used, word],
      words: [...state.words, { syllable, word, ms, points: pts.total, combo }],
      longest: word.length > state.longest.length ? word : state.longest,
    },
  };
}

/** Tajmer je istekao: bomba eksplodira, gubi se život, dobiva se novi slog. */
export function applyBoom(state: GameState): GameState {
  const lives = state.lives - 1;
  return {
    ...state,
    step: state.step + 1,
    lives,
    booms: state.booms + 1,
    combo: 0,
    lastFast: false,
    over: lives <= 0,
  };
}
