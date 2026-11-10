import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mode } from "@/lib/game/constants";
import { gameSeed } from "@/lib/game/seeds";
import { computeStats } from "@/lib/game/stats";
import { LocalRepository } from "@/lib/repo/local";
import { generateSyllables } from "@/lib/game/syllables";
import { dict, playLog } from "./helpers";

/** Lokalni (demo) repozitorij: dvije lige, neograničen broj partija, računa se najbolja; isti replay kao server. */
const D1 = "2026-11-10";
const D2 = "2026-11-11";
let repo: LocalRepository;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  repo = new LocalRepository(async () => dict);
});
afterEach(() => vi.useRealTimers());

/** Počni partiju u ligi, „pričekaj" (sat se pomakne) i pošalji valjani zapis (seed izveden iz ID-a koji je dodijelio „server"). */
async function play(date: string, words: number, mode: Mode = "daily") {
  const s = await repo.startGame(mode, date, false);
  if (!s.ok) throw new Error(s.error);
  vi.setSystemTime(Date.now() + 10 * 60_000);
  const { log } = playLog(gameSeed(mode, date, s.value.gameId), words);
  return repo.finishGame(mode, date, s.value.gameId, log);
}

describe("neograničen broj partija", () => {
  it("nakon gubitka se odmah može igrati ponovno; svaka partija se čuva", async () => {
    await repo.ensureProfile();
    for (const w of [6, 2, 9]) expect((await play(D1, w)).ok).toBe(true);
    const d = await repo.getStatus("daily", D1);
    expect(d.gamesToday).toBe(3);
    expect(d.playing).toBe(false);
    expect((await repo.listResults()).length).toBe(3);
  });

  it("najbolji rezultat (high score): slabija partija ga ne mijenja, bolja ga zamjenjuje", async () => {
    await repo.ensureProfile();
    const a = await play(D1, 8);
    const b = await play(D1, 2);
    const c = await play(D1, 12);
    if (!a.ok || !b.ok || !c.ok) throw new Error("partija nije prihvaćena");
    expect(a.value).toMatchObject({ dayBest: true, allTimeBest: true, gamesToday: 1 });
    expect(b.value.result.score).toBeLessThan(a.value.result.score);
    expect(b.value).toMatchObject({ dayBest: false, allTimeBest: false, bestToday: a.value.result.score, gamesToday: 2 });
    expect(c.value).toMatchObject({ dayBest: true, allTimeBest: true, gamesToday: 3 });
    expect((await repo.getStatus("daily", D1)).best?.score).toBe(c.value.result.score);
  });

  it("ljestvice daju najbolju partiju, ne zbroj (danas, tjedan, ukupno, prijatelji)", async () => {
    const me = await repo.ensureProfile();
    const r1 = await play(D1, 6);
    const r2 = await play(D1, 10);
    if (!r1.ok || !r2.ok) throw new Error("partija nije prihvaćena");
    const best = Math.max(r1.value.result.score, r2.value.result.score);
    for (const scope of ["daily", "weekly", "all", "friends"] as const) {
      const row = (await repo.getLeaderboard("daily", scope, D1)).find((r) => r.userId === me.id);
      expect(row?.points, scope).toBe(best);
      expect(row?.points, scope).toBeLessThan(r1.value.result.score + r2.value.result.score);
    }
  });

  it("tjedna i ukupna: najbolja partija bilo kojeg dana u razdoblju", async () => {
    const me = await repo.ensureProfile();
    const day1 = await play(D1, 14);
    const day2 = await play(D2, 4);
    if (!day1.ok || !day2.ok) throw new Error("partija nije prihvaćena");
    expect(day2.value.dayBest).toBe(true);
    expect(day2.value.allTimeBest).toBe(false);
    const row = async (scope: "daily" | "weekly" | "all") => (await repo.getLeaderboard("daily", scope, D2)).find((r) => r.userId === me.id)?.points;
    expect(await row("daily")).toBe(day2.value.result.score);
    expect(await row("weekly")).toBe(day1.value.result.score);
    expect(await row("all")).toBe(day1.value.result.score);
  });

  it("niz dana se ne udvostručuje drugom partijom istog dana", async () => {
    await repo.ensureProfile();
    await play(D1, 5);
    await play(D1, 6);
    await play(D2, 5);
    const stats = computeStats(await repo.listResults(), D2);
    expect(stats.currentStreak).toBe(2);
    expect(stats.played).toBe(3);
  });
});

describe("dvije lige: dnevna i trening", () => {
  it("trening partija dobiva niz slogova iz ID-a koji dodjeljuje „server“: svaka je drukčija; dnevna uvijek isti", async () => {
    await repo.ensureProfile();
    const t1 = await repo.startGame("training", D1, false);
    const t2 = await repo.startGame("training", D1, false);
    const d1 = await repo.startGame("daily", D1, false);
    if (!t1.ok || !t2.ok || !d1.ok) throw new Error("start nije uspio");
    expect(t1.value.gameId).not.toBe(t2.value.gameId);
    const seq = (id: string) => generateSyllables(gameSeed("training", D1, id), 12).join(",");
    expect(seq(t1.value.gameId)).not.toBe(seq(t2.value.gameId));
    const d2 = await repo.startGame("daily", D1, false);
    if (!d2.ok) throw new Error("start nije uspio");
    expect(generateSyllables(gameSeed("daily", D1, d1.value.gameId), 12)).toEqual(generateSyllables(gameSeed("daily", D1, d2.value.gameId), 12));
  });

  it("lige su neovisne: istovremeno nezavršene, zasebni rezultati i najbolji", async () => {
    await repo.ensureProfile();
    const dStart = await repo.startGame("daily", D1, false);
    const tStart = await repo.startGame("training", D1, false);
    if (!dStart.ok || !tStart.ok) throw new Error("start nije uspio");
    expect((await repo.getStatus("daily", D1)).playing).toBe(true);
    expect((await repo.getStatus("training", D1)).gameId).toBe(tStart.value.gameId);
    // završi samo trening: dnevna ostaje nezavršena
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const log = playLog(gameSeed("training", D1, tStart.value.gameId), 7).log;
    const t = await repo.finishGame("training", D1, tStart.value.gameId, log);
    expect(t.ok).toBe(true);
    expect((await repo.getStatus("daily", D1)).playing).toBe(true);
    expect((await repo.getStatus("training", D1))).toMatchObject({ playing: false, gamesToday: 1 });
    expect((await repo.getStatus("daily", D1)).best).toBeNull();
  });

  it("zapis dnevne lige se ne prihvaća za trening partiju i obrnuto (seed ovisi o ligi)", async () => {
    await repo.ensureProfile();
    const t = await repo.startGame("training", D1, false);
    if (!t.ok) throw new Error("start nije uspio");
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const dailyLog = playLog(gameSeed("daily", D1, t.value.gameId), 6).log;
    expect((await repo.finishGame("training", D1, t.value.gameId, dailyLog)).ok).toBe(false);
    // zapis koji klijent izmisli sa „zgodnim" seedom
    const chosen = playLog("trening:moj-lagani-seed", 6).log;
    expect((await repo.finishGame("training", D1, t.value.gameId, chosen)).ok).toBe(false);
    // ispravan zapis prolazi
    const ok = playLog(gameSeed("training", D1, t.value.gameId), 6).log;
    expect((await repo.finishGame("training", D1, t.value.gameId, ok)).ok).toBe(true);
  });

  it("pogrešan gameId se odbija", async () => {
    await repo.ensureProfile();
    const t = await repo.startGame("training", D1, false);
    if (!t.ok) throw new Error("start nije uspio");
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const log = playLog(gameSeed("training", D1, "tuđi-id"), 5).log;
    expect((await repo.finishGame("training", D1, "tuđi-id", log)).ok).toBe(false);
  });

  it("ljestvice su zasebne po ligi: trening partija ne ulazi u dnevnu ljestvicu i obrnuto", async () => {
    const me = await repo.ensureProfile();
    const dr = await play(D1, 5, "daily");
    const tr = await play(D1, 12, "training");
    if (!dr.ok || !tr.ok) throw new Error("partija nije prihvaćena");
    const mine = async (mode: Mode, scope: "daily" | "weekly" | "all" | "friends") => (await repo.getLeaderboard(mode, scope, D1)).find((r) => r.userId === me.id)?.points;
    for (const scope of ["daily", "weekly", "all", "friends"] as const) {
      expect(await mine("daily", scope), `dnevna ${scope}`).toBe(dr.value.result.score);
      expect(await mine("training", scope), `trening ${scope}`).toBe(tr.value.result.score);
    }
  });

  it("trening ne mijenja niz dana, a njegova statistika je zasebna", async () => {
    await repo.ensureProfile();
    await play(D1, 5, "training");
    await play(D1, 6, "training");
    const results = await repo.listResults();
    expect(computeStats(results, D1, "daily").played).toBe(0);
    expect(computeStats(results, D1, "daily").currentStreak).toBe(0);
    const ts = computeStats(results, D1, "training");
    expect(ts.played).toBe(2);
    expect(ts.currentStreak).toBe(0); // trening nema niz dana
    await play(D1, 4, "daily");
    expect(computeStats(await repo.listResults(), D1, "daily").currentStreak).toBe(1);
  });

  it("najbolji se računa zasebno: prvi rezultat u svakoj ligi je high score te lige", async () => {
    await repo.ensureProfile();
    const d = await play(D1, 12, "daily");
    const t = await play(D1, 3, "training");
    if (!d.ok || !t.ok) throw new Error("partija nije prihvaćena");
    expect(d.value).toMatchObject({ dayBest: true, allTimeBest: true });
    expect(t.value).toMatchObject({ dayBest: true, allTimeBest: true }); // iako je slabiji od dnevnog
  });

  it("simulirani prijatelji postoje u obje lige (duhovi, ljestvica, lista prijatelja)", async () => {
    await repo.ensureProfile();
    const gd = await repo.getGhosts("daily", D1);
    const gt = await repo.getGhosts("training", D1);
    expect(gd.length).toBeGreaterThan(0);
    expect(gt.length).toBeGreaterThan(0);
    expect(gd.every((g) => g.simulated) && gt.every((g) => g.simulated)).toBe(true);
    const friends = await repo.listFriends(D1);
    expect(friends.every((f) => f.bestScore >= 0 && f.trainingBest >= 0)).toBe(true);
    expect(friends.some((f) => f.trainingBest > 0)).toBe(true);
    expect((await repo.getLeaderboard("training", "friends", D1)).length).toBeGreaterThan(0);
  });
});

describe("početak, nastavak i odbacivanje partije", () => {
  it("resume:true nastavlja istu partiju (isti startedAt i gameId), resume:false počinje novu", async () => {
    await repo.ensureProfile();
    for (const mode of ["daily", "training"] as const) {
      const a = await repo.startGame(mode, D1, false);
      vi.setSystemTime(Date.now() + 5000);
      const resumed = await repo.startGame(mode, D1, true);
      const fresh = await repo.startGame(mode, D1, false);
      if (!a.ok || !resumed.ok || !fresh.ok) throw new Error("start nije uspio");
      expect(resumed.value).toEqual({ startedAt: a.value.startedAt, resumed: true, gameId: a.value.gameId });
      expect(fresh.value.resumed).toBe(false);
      expect(fresh.value.gameId).not.toBe(a.value.gameId);
      expect((await repo.getStatus(mode, D1)).playing).toBe(true);
    }
  });

  it("bez započete partije ne može se poslati rezultat; nakon slanja partija više nije aktivna", async () => {
    await repo.ensureProfile();
    const { log } = playLog(gameSeed("daily", D1, "x"), 4);
    expect((await repo.finishGame("daily", D1, "x", log)).ok).toBe(false);
    const s = await repo.startGame("daily", D1, false);
    if (!s.ok) throw new Error("start nije uspio");
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await repo.finishGame("daily", D1, s.value.gameId, log)).ok).toBe(true);
    expect((await repo.getStatus("daily", D1)).playing).toBe(false);
    expect((await repo.finishGame("daily", D1, s.value.gameId, log)).ok).toBe(false); // ponovno slanje nije moguće
  });

  it("isti replay kao server: nevaljan i „ubrzan“ zapis se odbijaju, partija ostaje aktivna", async () => {
    await repo.ensureProfile();
    const s = await repo.startGame("daily", D1, false);
    if (!s.ok) throw new Error("start nije uspio");
    const { log } = playLog(gameSeed("daily", D1, s.value.gameId), 5);
    const fast = await repo.finishGame("daily", D1, s.value.gameId, log); // zapis traje ≈ minutu, a partija je počela upravo sada
    expect(fast.ok).toBe(false);
    expect(fast.ok ? "" : fast.error).toMatch(/dulje nego što je partija stvarno trajala/);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const forged = log.map((e, i) => (i === 1 ? { ...e, w: "xqzkvbt" } : e));
    expect((await repo.finishGame("daily", D1, s.value.gameId, forged)).ok).toBe(false);
    expect((await repo.getStatus("daily", D1)).playing).toBe(true);
    expect((await repo.finishGame("daily", D1, s.value.gameId, log)).ok).toBe(true);
  });

  it("stariji spremljeni podaci (jedna partija po danu, bez lige) se preuzimaju kao dnevna liga", async () => {
    polyfillStorage();
    const legacy = { profile: null, results: { [D1]: { mode: "daily", date: D1, number: 12, score: 321, words: 9, maxCombo: 2, longest: "kravata", wordList: [], booms: 2, durationMs: 1, finishedAt: "2026-11-10T10:00:00.000Z" } }, started: {}, playing: { [D1]: 1700000000000 }, friends: [] };
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem("bomba:v1", JSON.stringify(legacy));
    const r = new LocalRepository(async () => dict);
    const d = await r.getStatus("daily", D1);
    expect(d.best?.score).toBe(321);
    expect(d.best?.id).toBeTruthy();
    expect(d.best?.mode).toBe("daily");
    expect(d.gamesToday).toBe(1);
    expect(d.playing).toBe(true); // stara nezavršena partija (samo broj ms) je preuzeta
    expect((await r.getStatus("training", D1)).gamesToday).toBe(0);
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});

function polyfillStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: { localStorage: Storage } }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage,
  };
}
