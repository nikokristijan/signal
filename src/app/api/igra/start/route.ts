import { challengeNumber, zagrebDateKey } from "@/lib/game/dates";
import { createAdminClient } from "@/lib/supabase/server";
import { currentUserId, demoMode, getGame, json, rowToResult } from "@/lib/server-games";

export const dynamic = "force-dynamic";

/**
 * POST /api/igra/start → započinje (ili nastavlja) JEDINI rangirani pokušaj za današnji dan.
 * Datum određuje SERVER (Europe/Zagreb), ne klijent. Vrijeme starta zapisuje server i kasnije
 * ograničava koliko dugo smije trajati poslani zapis.
 */
export async function POST() {
  if (demoMode()) return json({ error: "Demo način" }, 404);
  const userId = await currentUserId();
  if (!userId) return json({ error: "Prijavi se" }, 401);

  const date = zagrebDateKey();
  const existing = await getGame(userId, date);
  if (existing) {
    if (existing.status === "finished") return json({ date, state: "finished", startedAt: Date.parse(existing.started_at), result: rowToResult(existing) });
    return json({ date, state: "playing", startedAt: Date.parse(existing.started_at) });
  }

  const { data, error } = await createAdminClient()
    .from("games")
    .insert({ user_id: userId, challenge_date: date, challenge_number: challengeNumber(date) })
    .select("started_at")
    .single();
  if (error) {
    // utrka dvaju zahtjeva: drugi je upravo napravio red
    const again = await getGame(userId, date);
    if (again) return json({ date, state: again.status, startedAt: Date.parse(again.started_at) });
    return json({ error: "Partija se nije mogla započeti" }, 500);
  }
  return json({ date, state: "playing", startedAt: Date.parse(data.started_at) });
}
