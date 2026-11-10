import type { NextRequest } from "next/server";
import type { Mode } from "@/lib/game/constants";
import { challengeNumber, zagrebDateKey } from "@/lib/game/dates";
import { createAdminClient } from "@/lib/supabase/server";
import { currentUserId, demoMode, gamesFor, json, latestPlaying, MAX_GAMES_PER_DAY, playingFor } from "@/lib/server-games";

export const dynamic = "force-dynamic";

/**
 * POST /api/igra/start  { mode?: "daily" | "training", resume?: boolean }
 *
 * Započinje NOVU partiju u ligi (bez ograničenja broja partija; na ljestvici se gleda najbolja).
 * Dnevna liga: svi pokušaji istog dana koriste isti niz slogova (iz datuma).
 * Trening liga: niz slogova proizlazi iz ID-a partije koji dodjeljuje baza (uuid), pa ga klijent ne može birati.
 * Ako je `resume` istinit i postoji nezavršena partija u toj ligi, nastavlja nju; inače je odbacuje i počinje novu.
 * Datum i vrijeme starta određuje SERVER (Europe/Zagreb); vrijeme starta kasnije ograničava trajanje poslanog zapisa.
 */
export async function POST(req: NextRequest) {
  if (demoMode()) return json({ error: "Demo način" }, 404);
  const userId = await currentUserId();
  if (!userId) return json({ error: "Prijavi se" }, 401);

  const body = (await req.json().catch(() => ({}))) as { mode?: unknown; resume?: unknown };
  const mode: Mode = body.mode === "training" ? "training" : "daily";
  const resume = body.resume === true;
  const date = zagrebDateKey();
  const today = await gamesFor(userId, mode, date);
  const playing = latestPlaying(await playingFor(userId, mode, date));

  if (playing && resume) return json({ date, startedAt: Date.parse(playing.started_at), resumed: true, gameId: playing.id });
  if (today.length >= MAX_GAMES_PER_DAY) return json({ error: "Previše partija za jedan dan. Vrati se sutra." }, 429);

  const admin = createAdminClient();
  if (playing) {
    const q = admin.from("games").update({ status: "abandoned" }).eq("user_id", userId).eq("mode", mode).eq("status", "playing");
    await (mode === "daily" ? q.eq("challenge_date", date) : q);
  }

  const { data, error } = await admin
    .from("games")
    .insert({ user_id: userId, mode, challenge_date: date, challenge_number: challengeNumber(date), attempt_no: today.length + 1 })
    .select("id, started_at")
    .single();
  if (error || !data) return json({ error: "Partija se nije mogla započeti" }, 500);
  return json({ date, startedAt: Date.parse(data.started_at), resumed: false, gameId: data.id });
}
