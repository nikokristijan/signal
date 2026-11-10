import { addDays, daysBetween, LAUNCH_DATE, weekStartKey } from "../game/dates";
import type { AvatarSpec } from "../game/types";

/**
 * SIMULIRANI igrači samo za lokalni demo. Sve je deterministički (hash) pa je demo stabilan.
 * Supabase adapter nikad ne dira ovu datoteku.
 */
export interface MockUser {
  id: string;
  username: string;
  avatar: AvatarSpec;
  activity: number; // 0..1, koliko često igra
  skill: number; // 0..1
  joined: number; // dan od lansiranja
}

const roster: Array<[string, string, number, number, number]> = [
  ["ivan", "blue", 0.95, 0.8, 0],
  ["marija", "rose", 0.9, 0.7, 0],
  ["luka", "teal", 0.85, 0.65, 0],
  ["ana", "amber", 0.92, 0.85, 0],
  ["marko", "clay", 0.7, 0.55, 1],
  ["petra", "violet", 0.8, 0.75, 1],
  ["josip", "green", 0.6, 0.5, 2],
  ["ivana", "rose", 0.88, 0.6, 0],
  ["ante", "slate", 0.5, 0.45, 3],
  ["nika", "violet", 0.78, 0.82, 1],
  ["toma", "blue", 0.65, 0.58, 2],
  ["lana", "amber", 0.82, 0.68, 0],
  ["filip", "clay", 0.55, 0.4, 4],
  ["mia", "teal", 0.9, 0.9, 0],
  ["karlo", "green", 0.72, 0.62, 2],
  ["dora", "rose", 0.84, 0.72, 1],
  ["matej", "slate", 0.45, 0.5, 5],
  ["lucija", "violet", 0.76, 0.78, 0],
  ["borna", "blue", 0.6, 0.66, 3],
  ["tena", "amber", 0.87, 0.6, 1],
  ["dino", "clay", 0.5, 0.52, 6],
  ["sara", "teal", 0.93, 0.74, 0],
  ["leon", "green", 0.68, 0.56, 2],
  ["ema", "rose", 0.8, 0.84, 1],
];

export const MOCK_USERS: MockUser[] = roster.map(([username, color, activity, skill, joined]) => ({
  id: `mock-${username}`,
  username,
  avatar: { color },
  activity,
  skill,
  joined,
}));

export const DEFAULT_FRIENDS = ["ivan", "marija", "luka"];

function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export interface MockDay {
  words: number;
  score: number;
}

/** Što je simulirani igrač postigao na dan `dateKey`, ili null ako nije igrao. */
export function mockDay(user: MockUser, dateKey: string): MockDay | null {
  if (daysBetween(LAUNCH_DATE, dateKey) < user.joined) return null;
  if (hash01(`${user.id}:${dateKey}:igra`) > user.activity) return null;
  const r = hash01(`${user.id}:${dateKey}:rijeci`);
  const words = Math.max(4, Math.round(8 + user.skill * 30 + (r - 0.5) * 26));
  const perWord = 14 + user.skill * 5 + hash01(`${user.id}:${dateKey}:bodovi`) * 4;
  return { words, score: Math.round(words * perWord) };
}

export function mockRange(user: MockUser, from: string, to: string): { score: number; words: number; played: number } {
  let score = 0;
  let words = 0;
  let played = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = mockDay(user, d);
    if (r) {
      score += r.score;
      words += r.words;
      played++;
    }
  }
  return { score, words, played };
}

export function rangeFor(scope: "daily" | "weekly" | "all", today: string): [string, string] {
  if (scope === "daily") return [today, today];
  if (scope === "weekly") return [weekStartKey(today), today];
  return [LAUNCH_DATE, today];
}
