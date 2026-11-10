import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getServerDictionary } from "@/lib/dict/server";
import { checkElapsed, replayLog } from "@/lib/game/replay";
import { gameSeed } from "@/lib/game/seeds";
import type { LogEntry } from "@/lib/game/types";
import { createAdminClient } from "@/lib/supabase/server";
import { currentUserId, demoMode, finishedRows, finishInfo, gameById, gamesFor, json, latestPlaying, playingFor } from "@/lib/server-games";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const MAX_AGE_MS = 24 * 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/igra/kraj  { gameId, log: [{w, t}, …] }      (date i mode su neobavezni; dnevna bez gameId koristi najnoviju nezavršenu)
 *
 * Server ponovno ODIGRA partiju: iz SVOJIH podataka (liga, datum, id partije) izvede seed, pa provjeri slogove,
 * rječnik, slog, ponavljanja i vremena i SAM izračuna bodove. Klijent ne šalje bodove i ne može ih odrediti.
 * Rezultat upisuje bomba_record_result() (dostupna samo service_role ključu).
 * Slanje je idempotentno: isti zapis poslan ponovno (npr. nakon prekida veze) vraća već upisanu partiju.
 */
export async function POST(req: NextRequest) {
  if (demoMode()) return json({ error: "Demo način" }, 404);
  const userId = await currentUserId();
  if (!userId) return json({ error: "Prijavi se" }, 401);

  let body: { date?: unknown; gameId?: unknown; mode?: unknown; log?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Neispravan zahtjev" }, 400);
  }
  if (!Array.isArray(body.log)) return json({ error: "Neispravan zahtjev" }, 400);
  const gameId = typeof body.gameId === "string" && UUID.test(body.gameId) ? body.gameId : "";
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
  if (!gameId && !date) return json({ error: "Neispravan zahtjev" }, 400);

  // Samo oblik {w, t}: sve ostalo (npr. „score") se odbacuje.
  const log: LogEntry[] = body.log.map((e: unknown) => {
    const x = (e ?? {}) as { w?: unknown; t?: unknown };
    return { w: typeof x.w === "string" ? x.w : null, t: typeof x.t === "number" ? x.t : -1 };
  });
  const hash = createHash("sha256").update(JSON.stringify(log)).digest("hex");

  // Koja partija? Po ID-u (nova inačica klijenta) ili, za stariji klijent, najnovija nezavršena dnevna za taj datum.
  let game = gameId ? await gameById(userId, gameId) : latestPlaying(await playingFor(userId, "daily", date));
  if (!game && !gameId) {
    const done = finishedRows(await gamesFor(userId, "daily", date)).find((r) => r.log_hash === hash);
    if (done) return json(await finishInfo(userId, done));
  }
  if (!game) return json({ error: "Nema aktivne partije" }, 409);
  if (body.mode !== undefined && body.mode !== game.mode) return json({ error: "Partija ne pripada toj ligi" }, 400);

  if (game.status !== "playing") {
    if (game.status === "finished" && game.log_hash === hash) return json(await finishInfo(userId, game)); // idempotentno
    return json({ error: "Nema aktivne partije" }, 409);
  }
  if (game.attempts >= MAX_ATTEMPTS) return json({ error: "Previše neuspjelih pokušaja slanja" }, 429);

  const startedAt = Date.parse(game.started_at);
  const now = Date.now();
  const admin = createAdminClient();
  const gid = game.id;
  const attempts = game.attempts;
  const reject = async (error: string) => {
    await admin.from("games").update({ attempts: attempts + 1 }).eq("id", gid);
    return json({ error }, 422);
  };
  if (now - startedAt > MAX_AGE_MS) return reject("Partija je istekla");

  const replay = replayLog(gameSeed(game.mode, game.challenge_date, game.id), log, getServerDictionary());
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

  const after = await gameById(userId, game.id);
  if (!after) return json({ error: "Rezultat se nije mogao učitati" }, 500);
  return json(await finishInfo(userId, after));
}
