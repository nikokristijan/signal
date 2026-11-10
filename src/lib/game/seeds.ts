import { dailySeed } from "./dates";
import type { Mode } from "./constants";

/**
 * Seed partije (niz slogova):
 *  - dnevna liga: iz datuma, isti za sve taj dan;
 *  - trening liga: iz ID-a partije koji dodjeljuje SERVER (uuid), pa klijent ne može birati lagane slogove.
 */
export function gameSeed(mode: Mode, date: string, gameId: string): string {
  return mode === "daily" ? dailySeed(date) : `trening:${gameId}`;
}

export const LEAGUE_NAME: Record<Mode, string> = { daily: "Dnevna liga", training: "Trening liga" };
