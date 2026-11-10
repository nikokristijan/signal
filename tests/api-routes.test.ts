import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mode } from "@/lib/game/constants";
import { dailySeed, zagrebDateKey } from "@/lib/game/dates";
import { gameSeed } from "@/lib/game/seeds";
import { playLog } from "./helpers";

/**
 * Testira prave API rute (/api/igra/*) s pravom bazom (PGlite + prava migracija).
 * Zamijenjen je samo Supabase klijent: createUserClient (tko je prijavljen) i createAdminClient (tanki adapter prema PGlite-u).
 */
const state = vi.hoisted(() => ({ db: null as unknown as import("@electric-sql/pglite").PGlite, userId: null as string | null }));

vi.mock("@/lib/supabase/server", () => {
  class Query {
    private op: "select" | "insert" | "update" = "select";
    private filters: Array<[string, unknown]> = [];
    private payload: Record<string, unknown> = {};
    private cols = "*";
    constructor(private table: string) {}
    select(cols = "*") {
      this.cols = cols;
      return this;
    }
    insert(o: Record<string, unknown>) {
      this.op = "insert";
      this.payload = o;
      return this;
    }
    update(o: Record<string, unknown>) {
      this.op = "update";
      this.payload = o;
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push([c, v]);
      return this;
    }
    private async run() {
      const params: unknown[] = [];
      const ph = (v: unknown) => (params.push(v), `$${params.length}`);
      const where = this.filters.length ? " where " + this.filters.map(([c, v]) => `${c} = ${ph(v)}`).join(" and ") : "";
      let sql: string;
      if (this.op === "insert") {
        const keys = Object.keys(this.payload);
        sql = `insert into public.${this.table} (${keys.join(",")}) values (${keys.map((k) => ph(this.payload[k])).join(",")}) returning ${this.cols}`;
      } else if (this.op === "update") {
        const sets = Object.keys(this.payload).map((k) => `${k} = ${ph(this.payload[k])}`);
        sql = `update public.${this.table} set ${sets.join(",")}${where} returning ${this.cols}`;
      } else sql = `select ${this.cols} from public.${this.table}${where}`;
      try {
        const r = await state.db.query<Record<string, unknown>>(sql, params);
        // PostgREST (pravi Supabase) vraća datume kao „YYYY-MM-DD", a vremena kao ISO string; PGlite vraća Date objekte.
        const plain = r.rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => {
              if (!(v instanceof Date)) return [k, v];
              const midnight = v.getUTCHours() + v.getUTCMinutes() + v.getUTCSeconds() + v.getUTCMilliseconds() === 0;
              return [k, midnight ? v.toISOString().slice(0, 10) : v.toISOString()];
            }),
          ),
        );
        return { data: plain, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    }
    async maybeSingle() {
      const r = await this.run();
      return { data: r.data?.[0] ?? null, error: r.error };
    }
    async single() {
      const r = await this.run();
      return { data: r.data?.[0] ?? null, error: r.error ?? (r.data?.length ? null : { message: "no rows" }) };
    }
    then(resolve: (v: unknown) => void) {
      return this.run().then(resolve);
    }
  }
  return {
    createUserClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) } }),
    createAdminClient: () => ({
      from: (t: string) => new Query(t),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        const keys = Object.keys(args);
        try {
          await state.db.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}${k === "p_log" ? "::jsonb" : ""}`).join(", ")})`, keys.map((k) => (k === "p_log" ? JSON.stringify(args[k]) : args[k])));
          return { data: null, error: null };
        } catch (e) {
          return { data: null, error: { message: String(e) } };
        }
      },
    }),
  };
});

// uvoz ruta TEK nakon mock-a
const routes = async () => ({
  start: (await import("@/app/api/igra/start/route")).POST,
  kraj: (await import("@/app/api/igra/kraj/route")).POST,
  stanje: (await import("@/app/api/igra/stanje/route")).GET,
});

const TODAY = zagrebDateKey();
const post = (body: unknown) => new NextRequest("http://localhost/api/igra/kraj", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const startReq = (body?: unknown) => new NextRequest("http://localhost/api/igra/start", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const getReq = (date: string, mode?: Mode) => new NextRequest(`http://localhost/api/igra/stanje?date=${date}${mode ? `&mode=${mode}` : ""}`);

let userA = "";
let userB = "";

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  state.db = new PGlite();
  await state.db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
  `);
  for (const f of fs.readdirSync(path.join(__dirname, "../supabase/migrations")).sort()) {
    await state.db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8"));
  }
  userA = (await state.db.query<{ id: string }>("insert into auth.users default values returning id")).rows[0].id;
  userB = (await state.db.query<{ id: string }>("insert into auth.users default values returning id")).rows[0].id;
}, 60_000);

afterAll(async () => {
  await state.db.close();
});

beforeEach(async () => {
  await state.db.exec("delete from public.scores; delete from public.games; delete from public.streaks;");
  state.userId = userA;
});

/** Pomakni početak NEZAVRŠENIH partija u prošlost da zapis koji traje minutama bude vjerodostojan. */
const backdate = (user: string, minutes: number) =>
  state.db.query("update public.games set started_at = now() - ($1 || ' minutes')::interval where user_id = $2 and status = 'playing'", [String(minutes), user]);

/** Započni novu partiju u ligi i pošalji valjani zapis s `words` riječi. Seed izvodi iz podataka koje je dodijelio server. */
async function playGame(words: number, user = userA, mode: Mode = "daily") {
  const { start, kraj } = await routes();
  state.userId = user;
  const s = await start(startReq({ mode, resume: false }));
  expect(s.status).toBe(200);
  const { gameId } = await s.json();
  await backdate(user, 30);
  const { log } = playLog(gameSeed(mode, TODAY, gameId), words);
  const res = await kraj(post({ mode, date: TODAY, gameId, log }));
  return { res, log, gameId, body: await res.json() };
}

describe("/api/igra/start i /stanje", () => {
  it("bez prijave 401, bez Supabasea (demo) 404", async () => {
    const { start, stanje } = await routes();
    state.userId = null;
    expect((await start(startReq())).status).toBe(401);
    expect((await stanje(getReq(TODAY))).status).toBe(401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await start(startReq())).status).toBe(404);
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  });

  it("start stvara partiju za današnji dan s gameId; resume:true nastavlja istu (isti startedAt i gameId)", async () => {
    const { start, stanje } = await routes();
    const a = await (await start(startReq({ resume: false }))).json();
    expect(a).toMatchObject({ date: TODAY, resumed: false });
    expect(a.gameId).toMatch(/^[0-9a-f-]{36}$/);
    const b = await (await start(startReq({ resume: true }))).json();
    expect(b).toMatchObject({ startedAt: a.startedAt, resumed: true, gameId: a.gameId });
    expect((await state.db.query("select 1 from public.games")).rows).toHaveLength(1);
    const s = await (await stanje(getReq(TODAY))).json();
    expect(s).toMatchObject({ mode: "daily", playing: true, startedAt: a.startedAt, gameId: a.gameId, best: null, gamesToday: 0 });
    expect((await (await stanje(getReq("2026-01-01"))).json()).playing).toBe(false);
    expect((await stanje(getReq("nije-datum"))).status).toBe(400);
  });

  it("resume:false odbacuje nezavršenu partiju (abandoned) i počinje novu s većim rednim brojem", async () => {
    const { start } = await routes();
    await start(startReq({ resume: false }));
    const second = await (await start(startReq({ resume: false }))).json();
    expect(second.resumed).toBe(false);
    const rows = (await state.db.query<{ status: string; attempt_no: number }>("select status, attempt_no from public.games order by attempt_no")).rows;
    expect(rows).toEqual([
      { status: "abandoned", attempt_no: 1 },
      { status: "playing", attempt_no: 2 },
    ]);
  });

  it("bez tijela zahtjeva start je dnevna liga bez nastavka", async () => {
    const { start } = await routes();
    expect((await start(startReq())).status).toBe(200);
    expect((await state.db.query<{ mode: string }>("select mode from public.games")).rows[0].mode).toBe("daily");
  });

  it("najviše 300 partija po igraču, ligi i danu: sljedeća dobiva 429, druga liga i drugi igrač nisu pogođeni", async () => {
    const { start } = await routes();
    await state.db.query(
      "insert into public.games (user_id, mode, challenge_date, challenge_number, status, attempt_no) select $1, 'daily', $2::date, 1, 'abandoned', g from generate_series(1, 300) g",
      [userA, TODAY],
    );
    expect((await start(startReq({ mode: "daily", resume: false }))).status).toBe(429);
    expect((await start(startReq({ mode: "training", resume: false }))).status).toBe(200); // trening liga ima vlastito ograničenje
    state.userId = userB;
    expect((await start(startReq({ mode: "daily", resume: false }))).status).toBe(200);
  });
});

describe("dvije lige: dnevna i trening", () => {
  it("lige su neovisne: nezavršena dnevna i nezavršena trening partija mogu postojati istovremeno", async () => {
    const { start, stanje } = await routes();
    const d = await (await start(startReq({ mode: "daily", resume: false }))).json();
    const t = await (await start(startReq({ mode: "training", resume: false }))).json();
    expect(d.gameId).not.toBe(t.gameId);
    // start u jednoj ligi ne odbacuje partiju u drugoj
    expect((await (await stanje(getReq(TODAY, "daily"))).json())).toMatchObject({ playing: true, gameId: d.gameId });
    expect((await (await stanje(getReq(TODAY, "training"))).json())).toMatchObject({ mode: "training", playing: true, gameId: t.gameId });
    const rows = (await state.db.query<{ mode: string; status: string }>("select mode, status from public.games order by mode")).rows;
    expect(rows).toEqual([
      { mode: "daily", status: "playing" },
      { mode: "training", status: "playing" },
    ]);
  });

  it("trening partija ima SVOJ niz slogova koji server određuje (iz id-a partije); svaka nova je drukčija", async () => {
    const { start } = await routes();
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push((await (await start(startReq({ mode: "training", resume: false }))).json()).gameId);
    expect(new Set(ids).size).toBe(4);
    const { generateSyllables } = await import("@/lib/game/syllables");
    const firsts = ids.map((id) => generateSyllables(gameSeed("training", TODAY, id), 10).join(","));
    expect(new Set(firsts).size).toBe(4); // različiti nizovi
    expect(generateSyllables(gameSeed("daily", TODAY, ids[0]), 10)).toEqual(generateSyllables(dailySeed(TODAY), 10)); // dnevni ne ovisi o id-u
  });

  it("trening zapis se validira na serveru i upisuje u trening ligu: ne mijenja dnevnu ligu ni niz dana", async () => {
    const { body } = await playGame(8, userA, "training");
    expect(body.result.mode).toBe("training");
    const sc = (await state.db.query<{ mode: string; points: number }>("select mode, points from public.scores")).rows;
    expect(sc).toEqual([{ mode: "training", points: body.result.score }]);
    expect((await state.db.query("select 1 from public.streaks")).rows).toHaveLength(0); // trening ne gradi niz dana
    const { stanje } = await routes();
    expect((await (await stanje(getReq(TODAY, "daily"))).json())).toMatchObject({ best: null, gamesToday: 0 });
    expect((await (await stanje(getReq(TODAY, "training"))).json())).toMatchObject({ gamesToday: 1 });
  });

  it("dnevna partija gradi niz dana, a trening partija prije toga ga ne pokreće", async () => {
    await playGame(5, userA, "training");
    expect((await state.db.query("select 1 from public.streaks")).rows).toHaveLength(0);
    await playGame(5, userA, "daily");
    expect((await state.db.query<{ current_streak: number }>("select current_streak from public.streaks")).rows[0].current_streak).toBe(1);
  });

  it("najbolji rezultat se računa zasebno po ligi (high score u svakoj)", async () => {
    const d1 = (await playGame(10, userA, "daily")).body;
    const t1 = (await playGame(4, userA, "training")).body;
    expect(d1).toMatchObject({ dayBest: true, allTimeBest: true });
    expect(t1).toMatchObject({ dayBest: true, allTimeBest: true }); // prvi u trening ligi, iako je slabiji od dnevnog
    const t2 = (await playGame(2, userA, "training")).body;
    expect(t2).toMatchObject({ dayBest: false, allTimeBest: false, bestToday: t1.result.score });
  });

  it("zapis za pogrešnu ligu: trening id s dnevnim seedom (ili obrnuto) se odbija", async () => {
    const { start, kraj } = await routes();
    const t = await (await start(startReq({ mode: "training", resume: false }))).json();
    await backdate(userA, 30);
    const wrong = playLog(dailySeed(TODAY), 6).log; // niz za dnevnu ligu, a partija je trening
    expect((await kraj(post({ gameId: t.gameId, log: wrong }))).status).toBe(422);
    // tvrdnja o ligi koja ne odgovara partiji
    const ok = playLog(gameSeed("training", TODAY, t.gameId), 6).log;
    expect((await kraj(post({ mode: "daily", gameId: t.gameId, log: ok }))).status).toBe(400);
    expect((await kraj(post({ mode: "training", gameId: t.gameId, log: ok }))).status).toBe(200);
  });

  it("klijent ne može birati seed treninga: zapis za ČUDAN (lagani) niz ne prolazi", async () => {
    const { start, kraj } = await routes();
    const t = await (await start(startReq({ mode: "training", resume: false }))).json();
    await backdate(userA, 30);
    const chosen = playLog("trening:moj-lagani-seed", 9).log;
    expect((await kraj(post({ gameId: t.gameId, log: chosen }))).status).toBe(422);
  });

  it("tuđa partija se ne može završiti po gameId-u", async () => {
    const { start, kraj } = await routes();
    const t = await (await start(startReq({ mode: "training", resume: false }))).json();
    await backdate(userA, 30);
    state.userId = userB;
    const log = playLog(gameSeed("training", TODAY, t.gameId), 4).log;
    expect((await kraj(post({ gameId: t.gameId, log }))).status).toBe(409);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(0);
  });
});

describe("/api/igra/kraj: server ponovno odigrava partiju", () => {
  it("valjan zapis → server računa bodove i upisuje rezultat, niz i ljestvicu; vraća info o najboljem", async () => {
    const { stanje } = await routes();
    const { res, body, gameId } = await playGame(9);
    expect(res.status).toBe(200);
    const g = playLog(dailySeed(TODAY), 9).state;
    expect(body.result.score).toBe(g.score);
    expect(body.result.words).toBe(9);
    expect(body.result.id).toBe(gameId);
    expect(body).toMatchObject({ dayBest: true, allTimeBest: true, gamesToday: 1, bestToday: g.score });
    const sc = (await state.db.query<{ points: number; game_id: string }>("select points, game_id from public.scores")).rows;
    expect(sc).toEqual([{ points: g.score, game_id: gameId }]);
    expect((await state.db.query<{ current_streak: number }>("select current_streak from public.streaks where user_id = $1", [userA])).rows[0].current_streak).toBe(1);
    const st = await (await stanje(getReq(TODAY))).json();
    expect(st).toMatchObject({ playing: false, gamesToday: 1 });
    expect(st.best.score).toBe(g.score);
  });

  it("neograničen broj partija: slabija ne mijenja najbolji, bolja ga zamjenjuje (high score)", async () => {
    const { stanje } = await routes();
    const first = (await playGame(9)).body;
    const worse = (await playGame(3)).body;
    expect(worse.result.score).toBeLessThan(first.result.score);
    expect(worse).toMatchObject({ dayBest: false, allTimeBest: false, bestToday: first.result.score, gamesToday: 2 });
    let st = await (await stanje(getReq(TODAY))).json();
    expect(st.best.score).toBe(first.result.score);
    expect(st.gamesToday).toBe(2);
    const better = (await playGame(15)).body;
    expect(better.result.score).toBeGreaterThan(first.result.score);
    expect(better).toMatchObject({ dayBest: true, allTimeBest: true, gamesToday: 3, bestToday: better.result.score });
    st = await (await stanje(getReq(TODAY))).json();
    expect(st.best.score).toBe(better.result.score);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(3);
    expect((await state.db.query<{ current_streak: number }>("select current_streak from public.streaks")).rows[0].current_streak).toBe(1);
  });

  it("klijent ne može nametnuti bodove: polje score u zapisu i tijelu se ignorira", async () => {
    const { start, kraj } = await routes();
    const { gameId } = await (await start(startReq({ resume: false }))).json();
    await backdate(userA, 30);
    const { log, state: g } = playLog(dailySeed(TODAY), 5);
    const forged = log.map((e) => ({ ...e, score: 999999 }));
    const res = await kraj(post({ gameId, log: forged, score: 999999, points: 999999 }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.score).toBe(g.score);
    expect((await state.db.query<{ points: number }>("select points from public.scores")).rows[0].points).toBe(g.score);
  });

  it("slanje je idempotentno: isti zapis ponovno vraća istu partiju i ne dodaje redak", async () => {
    const { kraj } = await routes();
    const { log, gameId, body: first } = await playGame(4);
    const again = await (await kraj(post({ gameId, log }))).json();
    expect(again.result.id).toBe(first.result.id);
    expect(again.result.score).toBe(first.result.score);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(1);
  });

  it("drugi (različit) zapis za već završenu partiju se odbija (409): ne može se „poboljšati“", async () => {
    const { kraj } = await routes();
    const { gameId } = await playGame(4);
    const other = playLog(dailySeed(TODAY), 12).log;
    expect((await kraj(post({ gameId, log: other }))).status).toBe(409);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(1);
  });

  it("odbija nevaljan zapis (422), broji neuspjele pokušaje i nakon 5 blokira (429)", async () => {
    const { start, kraj } = await routes();
    const { gameId } = await (await start(startReq({ resume: false }))).json();
    await backdate(userA, 30);
    const { log } = playLog(dailySeed(TODAY), 6);
    const bad = log.map((e, i) => (i === 2 ? { ...e, w: "xqzkvbt" } : e));
    for (let i = 1; i <= 5; i++) expect((await kraj(post({ gameId, log: bad }))).status).toBe(422);
    expect((await state.db.query<{ attempts: number }>("select attempts from public.games")).rows[0].attempts).toBe(5);
    expect((await kraj(post({ gameId, log }))).status).toBe(429); // čak ni valjan zapis više ne prolazi za TU partiju
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(0);
    expect((await playGame(5)).res.status).toBe(200); // ali igrač može odigrati novu
  });

  it("zapis koji traje dulje od stvarno proteklog vremena se odbija", async () => {
    const { start, kraj } = await routes();
    const { gameId } = await (await start(startReq({ resume: false }))).json(); // počela prije nekoliko ms, a zapis tvrdi da traje ≈ minutu
    const { log } = playLog(dailySeed(TODAY), 6);
    const r = await kraj(post({ gameId, log }));
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/dulje nego što je partija stvarno trajala/);
  });

  it("zapis za pogrešan dan (drugi seed) se odbija", async () => {
    const { start, kraj } = await routes();
    const { gameId } = await (await start(startReq({ resume: false }))).json();
    await backdate(userA, 30);
    const { log } = playLog(dailySeed("2026-11-11"), 6);
    expect((await kraj(post({ gameId, log }))).status).toBe(422);
  });

  it("stariji klijent bez gameId-a: dnevna liga i dalje radi preko datuma", async () => {
    const { start, kraj } = await routes();
    await start(startReq({ resume: false }));
    await backdate(userA, 30);
    const { log, state: g } = playLog(dailySeed(TODAY), 5);
    const res = await kraj(post({ date: TODAY, log }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.score).toBe(g.score);
    // ponovno slanje istog zapisa je idempotentno
    expect((await kraj(post({ date: TODAY, log }))).status).toBe(200);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(1);
  });

  it("neispravni zahtjevi: bez partije 409, krivo tijelo 400, bez prijave 401", async () => {
    const { kraj } = await routes();
    expect((await kraj(post({ date: TODAY, log: [] }))).status).toBe(409);
    expect((await kraj(post({ gameId: "nije-uuid", log: [] }))).status).toBe(400);
    expect((await kraj(post({ log: [] }))).status).toBe(400);
    expect((await kraj(new NextRequest("http://localhost/api/igra/kraj", { method: "POST", body: "nije json" }))).status).toBe(400);
    expect((await kraj(post({ gameId: "00000000-0000-4000-8000-000000000000", log: [] }))).status).toBe(409);
    state.userId = null;
    expect((await kraj(post({ date: TODAY, log: [] }))).status).toBe(401);
  });

  it("igrači su međusobno odvojeni: B ne može završiti partiju koju je počeo A", async () => {
    const { start, kraj } = await routes();
    const { gameId } = await (await start(startReq({ resume: false }))).json();
    await backdate(userA, 30);
    state.userId = userB;
    const { log } = playLog(dailySeed(TODAY), 3);
    expect((await kraj(post({ gameId, log }))).status).toBe(409);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(0);
  });
});

describe("/api/status: je li baza spremna za prave prijatelje", () => {
  const status = async () => (await import("@/app/api/status/route")).GET();

  it("bez Supabase varijabli: demo način (prijatelji su simulirani), bez tajni u odgovoru", async () => {
    const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const body = await (await status()).json();
    expect(body).toEqual({ mode: "demo", configured: { url: false, anonKey: true, serviceRole: false }, ready: false });
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved.service;
    // samo istinito/neistinito: nikakve vrijednosti ključeva ni adrese projekta
    expect(Object.values(body.configured).every((v) => typeof v === "boolean")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("http://supabase.test");
  });

  it("spojeno i sve tri migracije primijenjene: ready", async () => {
    const body = await (await status()).json();
    expect(body).toMatchObject({ mode: "supabase", ready: true, schema: { base: true, unlimitedGames: true, leagues: true } });
    expect(Object.values(body.configured).every((v) => typeof v === "boolean")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("http://supabase.test"); // nikakvi ključevi ni adresa
  });

  it("spojeno, ali nedostaje zadnja migracija: javlja koja", async () => {
    await state.db.exec("alter table public.scores drop column mode cascade");
    const body = await (await status()).json();
    expect(body).toMatchObject({ mode: "supabase", ready: false, schema: { base: true, unlimitedGames: true, leagues: false } });
  });
});
