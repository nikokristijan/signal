import type { NextRequest } from "next/server";
import type { Mode } from "@/lib/game/constants";
import { challengeNumber } from "@/lib/game/dates";
import { bestRow, currentUserId, demoMode, finishedRows, gamesFor, json, latestPlaying, playingFor, rowToResult } from "@/lib/server-games";

export const dynamic = "force-dynamic";

/**
 * GET /api/igra/stanje?date=YYYY-MM-DD&mode=daily|training
 * Stanje igrača u ligi: najbolja današnja partija, broj partija danas i nezavršena partija (ako postoji).
 */
export async function GET(req: NextRequest) {
  if (demoMode()) return json({ error: "Demo način" }, 404);
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const mode: Mode = req.nextUrl.searchParams.get("mode") === "training" ? "training" : "daily";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Neispravan datum" }, 400);
  const userId = await currentUserId();
  if (!userId) return json({ error: "Prijavi se" }, 401);

  const rows = await gamesFor(userId, mode, date);
  const playing = latestPlaying(await playingFor(userId, mode, date));
  const best = bestRow(rows);
  return json({
    mode,
    date,
    number: challengeNumber(date),
    playing: Boolean(playing),
    startedAt: playing ? Date.parse(playing.started_at) : undefined,
    gameId: playing?.id,
    best: best ? rowToResult(best) : null,
    gamesToday: finishedRows(rows).length,
  });
}
