import type { NextRequest } from "next/server";
import { challengeNumber } from "@/lib/game/dates";
import { currentUserId, demoMode, getGame, json, rowToResult } from "@/lib/server-games";

export const dynamic = "force-dynamic";

/** GET /api/igra/stanje?date=YYYY-MM-DD → stanje dnevne partije prijavljenog igrača. */
export async function GET(req: NextRequest) {
  if (demoMode()) return json({ error: "Demo način" }, 404);
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Neispravan datum" }, 400);
  const userId = await currentUserId();
  if (!userId) return json({ error: "Prijavi se" }, 401);

  const g = await getGame(userId, date);
  const number = challengeNumber(date);
  if (!g) return json({ date, number, state: "new" });
  if (g.status === "finished") return json({ date, number, state: "finished", result: rowToResult(g), startedAt: Date.parse(g.started_at) });
  return json({ date, number, state: "playing", startedAt: Date.parse(g.started_at) });
}
