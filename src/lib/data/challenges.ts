import raw from "./challenges.json";
import { daysBetween } from "../game/dates";
import { STAGE_COUNT } from "../game/scoring";
import type { Challenge, ChallengeDef, PublicChallenge, Reveal } from "../game/types";

/** Day #1 of SIGNAL. Challenge N is shown on LAUNCH_DATE + (N - 1) days. */
export const LAUNCH_DATE = "2026-10-22";

export const CHALLENGE_DEFS = raw as unknown as ChallengeDef[];

export function stageUrls(slug: string): string[] {
  return Array.from({ length: STAGE_COUNT }, (_, i) => `/challenges/${slug}/stage-${i + 1}.webp`);
}

export function challengeNumberFor(dateKey: string): number {
  return Math.max(1, daysBetween(LAUNCH_DATE, dateKey) + 1);
}

function build(def: ChallengeDef, number: number, date: string): Challenge {
  return {
    id: `sig-${String(number).padStart(3, "0")}`,
    number,
    date,
    slug: def.slug,
    subject: def.subject,
    answer: def.answer,
    alternatives: def.alternatives,
    nudges: def.nudges,
    category: def.category,
    difficulty: def.difficulty,
    fact: def.fact,
    stages: stageUrls(def.slug),
    credit: def.credit,
  };
}

/**
 * The local dataset has one curated challenge per day for CHALLENGE_DEFS.length days;
 * after that it starts over so the game never runs dry in demo mode.
 */
export function getChallengeForDate(dateKey: string): Challenge {
  const number = challengeNumberFor(dateKey);
  return build(CHALLENGE_DEFS[(number - 1) % CHALLENGE_DEFS.length], number, dateKey);
}

export function getChallengeById(id: string): Challenge | null {
  const m = /^sig-(\d+)$/.exec(id);
  if (!m) return null;
  const number = Number(m[1]);
  const def = CHALLENGE_DEFS[(number - 1) % CHALLENGE_DEFS.length];
  const date = new Date(LAUNCH_DATE + "T12:00:00");
  date.setDate(date.getDate() + number - 1);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return build(def, number, key);
}

/** Every challenge of the first cycle with its date — used for seeding Supabase and for tests. */
export function allChallenges(): Challenge[] {
  return CHALLENGE_DEFS.map((def, i) => {
    const d = new Date(LAUNCH_DATE + "T12:00:00");
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return build(def, i + 1, key);
  });
}

export function toPublic(c: Challenge): PublicChallenge {
  return { id: c.id, number: c.number, date: c.date, stages: c.stages };
}

export function toReveal(c: Challenge): Reveal {
  return { subject: c.subject, answer: c.answer, category: c.category, difficulty: c.difficulty, fact: c.fact, credit: c.credit };
}
