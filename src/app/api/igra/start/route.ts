import type { NextRequest } from "next/server";
import { challengeNumber, zagrebDateKey } from "@/lib/game/dates";
import { createAdminClient } from "@/lib/supabase/server";
import { currentUserId, demoMode, gamesFor, json, latestPlaying, MAX_GAMES_PER_DAY } from "@/lib/server-games";

export const dynamic = "force-dynamic";

/**
 * POST /api/igra/start  { resume?: boolean }
 *
 * Započinje NOVU partiju za današnji dan (partija se može igrati koliko god puta; svi pokušaji istog dana
 * koriste isti niz slogova, a na ljestvici se gleda najbolji). Ako je `resume` istinit i postoji nezavršena
 * partija, nastavlja nju; inače je odbacuje i počinje novu. Datum određuje SERVER (Europe/Zagreb), a
 * vrijeme starta zapisuje server i kasnije ograničava koliko dugo smije trajati poslani zapis.
 */
export async function POST(req: NextRequest) {
  if (demoMode()) return json({ error: "Demo način" }, 404);
  const userId = await currentUserId();
  if (!userId) return json({ error: "Prijavi se" }, 401);

  const body = (await req.json().catch(() => ({}))) as { resume?: unknown };
  const resume = body.resume === true;
  const date = zagrebDateKey();
  const rows = await gamesFor(userId, date);
  const playing = latestPlaying(rows);

  if (playing && resume) return json({ date, startedAt: Date.parse(playing.started_at), resumed: true });
  if (rows.length >= MAX_GAMES_PER_DAY) return json({ error: "Previše partija za jedan dan. Vrati se sutra." }, 429);

  const admin = createAdminClient();
  if (playing) await admin.from("games").update({ status: "abandoned" }).eq("user_id", userId).eq("challenge_date", date).eq("status", "playing");

  const { data, error } = await admin
    .from("games")
    .insert({ user_id: userId, challenge_date: date, challenge_number: challengeNumber(date), attempt_no: rows.length + 1 })
    .select("started_at")
    .single();
  if (error || !data) return json({ error: "Partija se nije mogla započeti" }, 500);
  return json({ date, startedAt: Date.parse(data.started_at), resumed: false });
}
