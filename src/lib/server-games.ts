import "server-only";
import { NextResponse } from "next/server";
import { challengeNumber } from "./game/dates";
import type { GameResult } from "./game/types";
import { createAdminClient, createUserClient } from "./supabase/server";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function demoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Prijavljeni igrač iz cookieja (anonimni računi također imaju valjani JWT), ili null. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

interface GameRow {
  challenge_date: string;
  challenge_number: number;
  status: "playing" | "finished";
  started_at: string;
  finished_at: string | null;
  attempts: number;
  score: number | null;
  words: number | null;
  max_combo: number | null;
  longest: string | null;
  word_list: string[] | null;
  booms: number | null;
  duration_ms: number | null;
}

export function rowToResult(r: GameRow): GameResult {
  return {
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

export async function getGame(userId: string, date: string): Promise<GameRow | null> {
  const { data } = await createAdminClient().from("games").select("*").eq("user_id", userId).eq("challenge_date", date).maybeSingle();
  return (data as GameRow | null) ?? null;
}
