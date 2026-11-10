import type { LogEntry } from "./game/types";

/**
 * Napredak nezavršene dnevne partije. Sprema se nakon SVAKOG koraka da refresh ne resetira partiju:
 * refresh = nastavak, ne nova partija. Tajmer teče i dok je stranica zatvorena (sat se ne zaustavlja):
 * ako je u međuvremenu istekao, bomba je eksplodirala.
 */
export interface Progress {
  v: 1;
  date: string;
  /** Početak rangirane partije (serverski sat, ms). */
  startedAt: number;
  log: LogEntry[];
  /** Kad je trenutni slog prikazan (Date.now()). */
  shownAt: number;
}

const KEY = "bomba:progress:v1";

export function loadProgress(date: string): Progress | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Progress;
    return p && p.v === 1 && p.date === date && Array.isArray(p.log) ? p : null;
  } catch {
    return null;
  }
}

export function saveProgress(p: Progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* nema pohrane: partija radi, ali refresh je ne može nastaviti */
  }
}

export function clearProgress() {
  try {
    window.localStorage.removeItem(KEY);
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
