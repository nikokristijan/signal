import { addDays, daysBetween, monthStartKey, weekStartKey } from "../game/dates";
import { STAGE_POINTS, WRONG_PENALTY } from "../game/scoring";
import type { AvatarSpec } from "../game/types";
import { LAUNCH_DATE } from "../data/challenges";

/**
 * SIMULATED players for local demo mode only. Everything here is deterministic
 * (hash based) so the demo is stable between reloads. The Supabase adapter never
 * touches this file.
 */
export interface MockUser {
  id: string;
  username: string;
  avatar: AvatarSpec;
  /** 0..1, how often they play. */
  activity: number;
  /** 0..1, how quickly they recognise things. */
  skill: number;
  /** Day offset from launch when they joined. */
  joined: number;
}

const roster: Array<[string, string, number, number, number]> = [
  ["maya", "rose", 0.95, 0.8, 0],
  ["leo", "blue", 0.85, 0.65, 0],
  ["noor", "violet", 0.9, 0.7, 2],
  ["kai", "teal", 0.7, 0.55, 0],
  ["ivy", "amber", 0.8, 0.85, 1],
  ["otto", "clay", 0.6, 0.5, 3],
  ["zara", "green", 0.92, 0.75, 0],
  ["finn", "slate", 0.5, 0.45, 5],
  ["luna", "violet", 0.78, 0.6, 1],
  ["hugo", "blue", 0.65, 0.7, 4],
  ["mira", "rose", 0.88, 0.62, 0],
  ["theo", "teal", 0.55, 0.4, 6],
  ["nina", "amber", 0.82, 0.78, 2],
  ["jonas", "clay", 0.45, 0.58, 8],
  ["ada", "green", 0.97, 0.9, 0],
  ["felix", "slate", 0.72, 0.52, 3],
  ["lena", "rose", 0.68, 0.66, 5],
  ["marko", "blue", 0.75, 0.6, 1],
  ["petra", "violet", 0.58, 0.72, 7],
  ["ivan", "teal", 0.4, 0.48, 9],
  ["sara", "amber", 0.86, 0.68, 0],
  ["luka", "clay", 0.62, 0.54, 4],
  ["ana", "green", 0.9, 0.82, 1],
  ["tomas", "slate", 0.52, 0.46, 10],
];

export const MOCK_USERS: MockUser[] = roster.map(([username, color, activity, skill, joined]) => ({
  id: `mock-${username}`,
  username,
  avatar: { color },
  activity,
  skill,
  joined,
}));

export const DEFAULT_FRIENDS = ["maya", "leo", "noor"];

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

/** Points a simulated player scored on `dateKey`, or null if they did not play. */
export function mockPoints(user: MockUser, dateKey: string): number | null {
  const day = daysBetween(LAUNCH_DATE, dateKey);
  if (day < user.joined) return null;
  if (hash01(`${user.id}:${dateKey}:play`) > user.activity) return null;
  if (hash01(`${user.id}:${dateKey}:giveup`) < 0.04) return 0;
  // Better players solve earlier; bias the stage with skill.
  const r = hash01(`${user.id}:${dateKey}:stage`);
  const stage = Math.min(5, Math.max(1, Math.ceil(Math.pow(r, 0.6 + user.skill * 1.1) * 5 + (1 - user.skill) * 1.2)));
  const wrong = Math.floor(hash01(`${user.id}:${dateKey}:wrong`) * (stage >= 3 ? 3 : 2));
  return Math.max(0, STAGE_POINTS[stage - 1] - wrong * WRONG_PENALTY);
}

export function mockTotal(user: MockUser, fromKey: string, toKey: string): number {
  let sum = 0;
  for (let d = fromKey; d <= toKey; d = addDays(d, 1)) sum += mockPoints(user, d) ?? 0;
  return sum;
}

export function rangeFor(scope: "daily" | "weekly" | "monthly" | "all", today: string): [string, string] {
  switch (scope) {
    case "daily":
      return [today, today];
    case "weekly":
      return [weekStartKey(today), today];
    case "monthly":
      return [monthStartKey(today), today];
    default:
      return [LAUNCH_DATE, today];
  }
}
