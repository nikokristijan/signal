import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailySeed } from "@/lib/game/dates";
import { LocalRepository } from "@/lib/repo/local";
import { dict, playLog } from "./helpers";

/** Lokalni (demo) repozitorij: neograničen broj partija, računa se najbolja; isti replay kao server. */
const D1 = "2026-11-10";
const D2 = "2026-11-11";
let repo: LocalRepository;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  repo = new LocalRepository(async () => dict);
});
afterEach(() => vi.useRealTimers());

/** Počni partiju, „pričekaj" (sat se pomakne) i pošalji valjani zapis. */
async function play(date: string, words: number) {
  const s = await repo.startDaily(date, false);
  expect(s.ok).toBe(true);
  vi.setSystemTime(Date.now() + 10 * 60_000);
  const { log } = playLog(dailySeed(date), words);
  return repo.finishDaily(date, log);
}

describe("neograničen broj partija", () => {
  it("nakon gubitka se odmah može igrati ponovno; svaka partija se čuva", async () => {
    await repo.ensureProfile();
    for (const w of [6, 2, 9]) expect((await play(D1, w)).ok).toBe(true);
    const d = await repo.getDaily(D1);
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
    expect((await repo.getDaily(D1)).best?.score).toBe(c.value.result.score);
  });

  it("ljestvice daju najbolju partiju, ne zbroj (danas, tjedan, ukupno)", async () => {
    const me = await repo.ensureProfile();
    const r1 = await play(D1, 6);
    const r2 = await play(D1, 10);
    if (!r1.ok || !r2.ok) throw new Error("partija nije prihvaćena");
    const best = Math.max(r1.value.result.score, r2.value.result.score);
    for (const scope of ["daily", "weekly", "all", "friends"] as const) {
      const row = (await repo.getLeaderboard(scope, D1)).find((r) => r.userId === me.id);
      expect(row?.points, scope).toBe(best);
      expect(row?.points, scope).toBeLessThan(r1.value.result.score + r2.value.result.score);
    }
  });

  it("tjedna i ukupna: najbolja partija bilo kojeg dana u razdoblju", async () => {
    const me = await repo.ensureProfile();
    const day1 = await play(D1, 14); // jači prvi dan
    const day2 = await play(D2, 4); // slabiji drugi dan
    if (!day1.ok || !day2.ok) throw new Error("partija nije prihvaćena");
    expect(day2.value.dayBest).toBe(true); // prvi rezultat TOG dana
    expect(day2.value.allTimeBest).toBe(false); // ali nije high score
    const row = async (scope: "daily" | "weekly" | "all") => (await repo.getLeaderboard(scope, D2)).find((r) => r.userId === me.id)?.points;
    expect(await row("daily")).toBe(day2.value.result.score);
    expect(await row("weekly")).toBe(day1.value.result.score); // 10. i 11. 11. su u istom tjednu (ponedjeljak 9. 11.)
    expect(await row("all")).toBe(day1.value.result.score);
  });

  it("niz dana se ne udvostručuje drugom partijom istog dana", async () => {
    await repo.ensureProfile();
    await play(D1, 5);
    await play(D1, 6);
    await play(D2, 5);
    const { computeStats } = await import("@/lib/game/stats");
    const stats = computeStats(await repo.listResults(), D2);
    expect(stats.currentStreak).toBe(2);
    expect(stats.played).toBe(3);
  });
});

describe("početak, nastavak i odbacivanje partije", () => {
  it("resume:true nastavlja istu partiju (isti startedAt), resume:false počinje novu", async () => {
    await repo.ensureProfile();
    const a = await repo.startDaily(D1, false);
    vi.setSystemTime(Date.now() + 5000);
    const resumed = await repo.startDaily(D1, true);
    const fresh = await repo.startDaily(D1, false);
    if (!a.ok || !resumed.ok || !fresh.ok) throw new Error("start nije uspio");
    expect(resumed.value).toEqual({ startedAt: a.value.startedAt, resumed: true });
    expect(fresh.value.resumed).toBe(false);
    expect(fresh.value.startedAt).toBeGreaterThan(a.value.startedAt);
    expect((await repo.getDaily(D1)).playing).toBe(true);
  });

  it("bez započete partije ne može se poslati rezultat; nakon slanja partija više nije aktivna", async () => {
    await repo.ensureProfile();
    const { log } = playLog(dailySeed(D1), 4);
    expect((await repo.finishDaily(D1, log)).ok).toBe(false);
    await play(D1, 4);
    expect((await repo.getDaily(D1)).playing).toBe(false);
    expect((await repo.finishDaily(D1, log)).ok).toBe(false); // isti zapis se ne može poslati ponovno (nema aktivne partije)
  });

  it("isti replay kao server: nevaljan zapis i „ubrzan“ zapis se odbijaju, partija ostaje aktivna", async () => {
    await repo.ensureProfile();
    await repo.startDaily(D1, false);
    const { log } = playLog(dailySeed(D1), 5);
    // zapis traje ≈ minutu, a partija je počela upravo sada
    const fast = await repo.finishDaily(D1, log);
    expect(fast.ok).toBe(false);
    expect(fast.ok ? "" : fast.error).toMatch(/dulje nego što je partija stvarno trajala/);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const forged = log.map((e, i) => (i === 1 ? { ...e, w: "xqzkvbt" } : e));
    expect((await repo.finishDaily(D1, forged)).ok).toBe(false);
    expect((await repo.getDaily(D1)).playing).toBe(true);
    expect((await repo.finishDaily(D1, log)).ok).toBe(true); // ispravan zapis i dalje prolazi
  });

  it("stariji spremljeni podaci (jedna partija po danu) se preuzimaju", async () => {
    window_localStorage_polyfill();
    const legacy = { profile: null, results: { [D1]: { mode: "daily", date: D1, number: 12, score: 321, words: 9, maxCombo: 2, longest: "kravata", wordList: [], booms: 2, durationMs: 1, finishedAt: "2026-11-10T10:00:00.000Z" } }, started: {}, friends: [] };
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem("bomba:v1", JSON.stringify(legacy));
    const r = new LocalRepository(async () => dict);
    const d = await r.getDaily(D1);
    expect(d.best?.score).toBe(321);
    expect(d.best?.id).toBeTruthy();
    expect(d.gamesToday).toBe(1);
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});

function window_localStorage_polyfill() {
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
