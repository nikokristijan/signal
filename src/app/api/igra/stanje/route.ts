import type { NextRequest } from "next/server";
import { challengeNumber } from "@/lib/game/dates";
import { bestRow, currentUserId, demoMode, finishedRows, gamesFor, json, latestPlaying, rowToResult } from "@/lib/server-games";

export const dynamic = "force-dynamic";

/** GET /api/igra/stanje?date=YYYY-MM-DD → stanje igrača za taj dan: najbolja partija, broj partija, nezavršena partija. */
export async function GET(req: NextRequest) {
  if (demoMode()) return json({ error: "Demo način" }, 404);
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Neispravan datum" }, 400);
  const userId = await currentUserId();
  if (!userId) return json({ error: "Prijavi se" }, 401);

  const rows = await gamesFor(userId, date);
  const playing = latestPlaying(rows);
  const best = bestRow(rows);
  return json({
    date,
    number: challengeNumber(date),
    playing: Boolean(playing),
    startedAt: playing ? Date.parse(playing.started_at) : undefined,
    best: best ? rowToResult(best) : null,
    gamesToday: finishedRows(rows).length,
  });
}
