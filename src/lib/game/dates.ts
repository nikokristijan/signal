/** Svi datumi igre računaju se u vremenu Europe/Zagreb: ponoć je granica za sve igrače. */
export const TIMEZONE = "Europe/Zagreb";
/** Dan #1. Broj izazova = dani od lansiranja + 1. */
export const LAUNCH_DATE = "2026-10-30";

const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD u Zagrebu. */
export function zagrebDateKey(d: Date = new Date()): string {
  return keyFmt.format(d);
}

function utcDay(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function addDays(key: string, n: number): string {
  return new Date((utcDay(key) + n) * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(fromKey: string, toKey: string): number {
  return utcDay(toKey) - utcDay(fromKey);
}

export function challengeNumber(dateKey: string): number {
  return Math.max(1, daysBetween(LAUNCH_DATE, dateKey) + 1);
}

/** Seed dnevnog izazova: svi taj dan dobiju isti niz slogova. */
export function dailySeed(dateKey: string): string {
  return `bomba:${dateKey}`;
}

/** Ponedjeljak tjedna u kojem je `key`. */
export function weekStartKey(key: string): string {
  const dow = (new Date(utcDay(key) * 86_400_000).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
}

/**
 * Milisekunde do sljedeće ponoći u Zagrebu (točno i na dane promjene sata: bisekcija po datumskom ključu).
 */
export function msUntilNextMidnight(now: Date = new Date()): number {
  const today = zagrebDateKey(now);
  let lo = 0; // ovdje je još „danas"
  let hi = 26 * 3_600_000; // ovdje je sigurno sutra
  while (hi - lo > 250) {
    const mid = (lo + hi) >> 1;
    if (zagrebDateKey(new Date(now.getTime() + mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
}

export function formatDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d}. ${m}. ${y}.`;
}
