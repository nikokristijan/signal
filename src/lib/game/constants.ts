/** Sva pravila igre na jednom mjestu. Isti kod koristi klijent, lokalni demo i server. */

export const START_LIVES = 2;

/** Tajmer: počinje na 10 s, svaka točna riječ skraćuje za 0,25 s, do minimalno 3 s. */
export const BASE_TIME_S = 10;
export const TIME_STEP_S = 0.25;
export const MIN_TIME_S = 3;

/** Combo: odgovor brži od 2 s povećava combo i daje +1 s sljedećem tajmeru. */
export const FAST_MS = 2000;
export const FAST_BONUS_S = 1;

/**
 * Bodovi: što je riječ duža, to više vrijedi. Riječ vrijedi koliko je slova na kvadrat
 * (kravata = 49, ukrasti = 64, neprobojnost = 144), plus bonus za combo (2 × combo, najviše 30).
 */
export const COMBO_POINTS = 2;
export const COMBO_BONUS_CAP = 30;

/** Zaštita od botova/neispravnih zapisa u replayu. */
export const MIN_TYPING_MS_BASE = 150;
export const MIN_TYPING_MS_PER_CHAR = 40;
export const MAX_LOG_ENTRIES = 3000;
export const MAX_WORD_INPUT = 40;
/** Zapis ne smije obuhvatiti više vremena nego što je stvarno proteklo od starta (+ ova rezerva). */
export const ELAPSED_SLACK_MS = 3000;

export const MODES = ["daily", "training"] as const;
export type Mode = (typeof MODES)[number];
