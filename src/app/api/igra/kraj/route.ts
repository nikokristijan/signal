import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getServerDictionary } from "@/lib/dict/server";
import { dailySeed } from "@/lib/game/dates";
import { checkElapsed, replayLog } from "@/lib/game/replay";
import type { LogEntry } from "@/lib/game/types";
import { createAdminClient } from "@/lib/supabase/server";
import { currentUserId, demoMode, finishedRows, finishInfo, gamesFor, json, latestPlaying } from "@/lib/server-games";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const MAX_AGE_MS = 24 * 3_600_000;

/**
 * POST /api/igra/kraj  { date, log: [{w, t}, …] }
 *
 * Server ponovno ODIGRA partiju: provjeri seed (slogove), rječnik, slog, ponavljanja i vremena, pa SAM
 * izračuna bodove i upiše rezultat. Klijent ne šalje bodove i ne može ih odrediti.
 * Rezultat se upisuje preko bomba_record_result() (dostupna samo service_role ključu).
 * Slanje je idempotentno: isti zapis poslan ponovno (npr. nakon prekida veze) vraća već upisanu partiju.
 */
export async function POST(req: NextRequest) {
  if (demoMode()) return json({ error: "Demo način" }, 404);
  const userId = await currentUserId();
  if (!userId) return json({ error: "Prijavi se" }, 401);

  let body: { date?: unknown; log?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Neispravan zahtjev" }, 400);
  }
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
  if (!date || !Array.isArray(body.log)) return json({ error: "Neispravan zahtjev" }, 400);

  // Samo oblik {w, t}: sve ostalo (npr. „score") se odbacuje.
  const log: LogEntry[] = body.log.map((e: unknown) => {
    const x = (e ?? {}) as { w?: unknown; t?: unknown };
    return { w: typeof x.w === "string" ? x.w : null, t: typeof x.t === "number" ? x.t : -1 };
  });
  const hash = createHash("sha256").update(JSON.stringify(log)).digest("hex");

  const rows = await gamesFor(userId, date);
  const game = latestPlaying(rows);
  if (!game) {
    const done = finishedRows(rows).find((r) => r.log_hash === hash);
    if (done) return json(await finishInfo(userId, date, done)); // idempotentno
    return json({ error: "Nema aktivne partije" }, 409);
  }
  if (game.attempts >= MAX_ATTEMPTS) return json({ error: "Previše neuspjelih pokušaja slanja" }, 429);

  const startedAt = Date.parse(game.started_at);
  const now = Date.now();
  const admin = createAdminClient();
  const reject = async (error: string) => {
    await admin.from("games").update({ attempts: game.attempts + 1 }).eq("id", game.id);
    return json({ error }, 422);
  };
  if (now - startedAt > MAX_AGE_MS) return reject("Partija je istekla");

  const replay = replayLog(dailySeed(date), log, getServerDictionary());
  if (!replay.ok) return reject(replay.error);
  const elapsed = checkElapsed(replay.value.summary.durationMs, startedAt, now);
  if (!elapsed.ok) return reject(elapsed.error);

  const s = replay.value.summary;
  const { error } = await admin.rpc("bomba_record_result", {
    p_game: game.id,
    p_score: s.score,
    p_words: s.words,
    p_max_combo: s.maxCombo,
    p_longest: s.longest,
    p_word_list: s.wordList,
    p_booms: s.booms,
    p_duration_ms: s.durationMs,
    p_log: log,
    p_log_hash: hash,
  });
  if (error) return json({ error: "Rezultat se nije mogao spremiti" }, 500);

  const after = (await gamesFor(userId, date)).find((r) => r.id === game.id);
  if (!after) return json({ error: "Rezultat se nije mogao učitati" }, 500);
  return json(await finishInfo(userId, date, after));
}
