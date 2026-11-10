import "server-only";
import { NextResponse } from "next/server";
import { challengeNumber } from "./game/dates";
import type { FinishInfo, GameResult } from "./game/types";
import { createAdminClient, createUserClient } from "./supabase/server";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function demoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Zaštita od zalijevanja baze: najviše toliko partija po igraču i danu. */
export const MAX_GAMES_PER_DAY = 300;

/** Prijavljeni igrač iz cookieja (anonimni računi također imaju valjani JWT), ili null. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Stupci partije bez `log` (zapis je velik i ne treba za ove upite). */
export const GAME_COLS =
  "id, challenge_date, challenge_number, status, started_at, finished_at, attempts, attempt_no, score, words, max_combo, longest, word_list, booms, duration_ms, log_hash";

export interface GameRow {
  id: string;
  challenge_date: string;
  challenge_number: number;
  status: "playing" | "finished" | "abandoned";
  started_at: string;
  finished_at: string | null;
  attempts: number;
  attempt_no: number;
  score: number | null;
  words: number | null;
  max_combo: number | null;
  longest: string | null;
  word_list: string[] | null;
  booms: number | null;
  duration_ms: number | null;
  log_hash: string | null;
}

export function rowToResult(r: GameRow): GameResult {
  return {
    id: r.id,
    mode: "daily",
    date: r.challenge_date,
    number: r.challenge_number ?? challengeNumber(r.challenge_date),
    score: r.score ?? 0,
    words: r.words ?? 0,
    maxCombo: r.max_combo ?? 0,
    longest: r.longest ?? "",
    wordList: r.word_list ?? [],
    booms: r.booms ?? 0,
    durationMs: r.duration_ms ?? 0,
    finishedAt: r.finished_at ?? "",
  };
}

/** Sve partije igrača za taj dan (najviše MAX_GAMES_PER_DAY). */
export async function gamesFor(userId: string, date: string): Promise<GameRow[]> {
  const { data } = await createAdminClient().from("games").select(GAME_COLS).eq("user_id", userId).eq("challenge_date", date);
  return (data as GameRow[] | null) ?? [];
}

export const finishedRows = (rows: GameRow[]) => rows.filter((r) => r.status === "finished");

/** Zadnja nezavršena partija (ako ih je zbog utrke više, vrijedi najnovija). */
export function latestPlaying(rows: GameRow[]): GameRow | null {
  return rows.filter((r) => r.status === "playing").sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0] ?? null;
}

/** Bolja partija: više bodova, pri jednakosti više riječi, pri jednakosti ranija. */
export function betterRow(a: GameRow, b: GameRow): boolean {
  return (
    (a.score ?? 0) > (b.score ?? 0) ||
    ((a.score ?? 0) === (b.score ?? 0) && ((a.words ?? 0) > (b.words ?? 0) || ((a.words ?? 0) === (b.words ?? 0) && (a.finished_at ?? "") < (b.finished_at ?? ""))))
  );
}

export function bestRow(rows: GameRow[]): GameRow | null {
  let best: GameRow | null = null;
  for (const r of finishedRows(rows)) if (!best || betterRow(r, best)) best = r;
  return best;
}

/** Sve ZAVRŠENE partije igrača osim jedne (za usporedbu najboljeg rezultata). */
async function otherFinished(userId: string, exceptId: string): Promise<GameRow[]> {
  const { data } = await createAdminClient().from("games").select(GAME_COLS).eq("user_id", userId).eq("status", "finished");
  return ((data as GameRow[] | null) ?? []).filter((r) => r.id !== exceptId);
}

/** Što igrač treba znati odmah nakon partije: je li to novi najbolji rezultat danas / svih vremena. */
export async function finishInfo(userId: string, date: string, game: GameRow): Promise<FinishInfo> {
  const others = await otherFinished(userId, game.id);
  const bestAll = bestRow(others);
  const todayOthers = others.filter((r) => r.challenge_date === date);
  const bestDay = bestRow(todayOthers);
  return {
    result: rowToResult(game),
    bestToday: Math.max(game.score ?? 0, bestDay?.score ?? 0),
    dayBest: !bestDay || betterRow(game, bestDay),
    allTimeBest: !bestAll || betterRow(game, bestAll),
    gamesToday: todayOthers.length + 1,
  };
}
