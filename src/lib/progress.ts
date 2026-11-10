import type { Mode } from "./game/constants";
import type { LogEntry } from "./game/types";

/**
 * Napredak nezavršene partije (u svakoj ligi posebno). Sprema se nakon SVAKOG koraka da refresh ne resetira partiju:
 * refresh = nastavak, ne nova partija. Tajmer teče i dok je stranica zatvorena (sat se ne zaustavlja):
 * ako je u međuvremenu istekao, bomba je eksplodirala.
 */
export interface Progress {
  v: 2;
  mode: Mode;
  date: string;
  /** ID partije koji je dodijelio server; kod treninga iz njega proizlazi niz slogova. */
  gameId: string;
  /** Početak partije (serverski sat, ms). */
  startedAt: number;
  log: LogEntry[];
  /** Kad je trenutni slog prikazan (Date.now()). */
  shownAt: number;
}

const key = (mode: Mode) => `bomba:progress:v2:${mode}`;

export function loadProgress(mode: Mode): Progress | null {
  try {
    const raw = window.localStorage.getItem(key(mode));
    if (!raw) return null;
    const p = JSON.parse(raw) as Progress;
    return p && p.v === 2 && p.mode === mode && typeof p.gameId === "string" && Array.isArray(p.log) ? p : null;
  } catch {
    return null;
  }
}

export function saveProgress(p: Progress) {
  try {
    window.localStorage.setItem(key(p.mode), JSON.stringify(p));
  } catch {
    /* nema pohrane: partija radi, ali refresh je ne može nastaviti */
  }
}

export function clearProgress(mode: Mode) {
  try {
    window.localStorage.removeItem(key(mode));
  } catch {
    /* ignore */
  }
}

export interface Settings {
  sound: boolean;
  vibrate: boolean;
}
const SKEY = "bomba:settings:v1";

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SKEY);
    if (raw) return { sound: true, vibrate: true, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { sound: true, vibrate: true };
}

export function saveSettings(s: Settings) {
  try {
    window.localStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
