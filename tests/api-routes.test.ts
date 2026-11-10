import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dailySeed, zagrebDateKey } from "@/lib/game/dates";
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
const getReq = (date: string) => new NextRequest(`http://localhost/api/igra/stanje?date=${date}`);

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

/** Pomakni početak NEZAVRŠENE partije u prošlost da zapis koji traje minutama bude vjerodostojan. */
const backdate = (user: string, minutes: number) =>
  state.db.query("update public.games set started_at = now() - ($1 || ' minutes')::interval where user_id = $2 and status = 'playing'", [String(minutes), user]);

/** Započni novu partiju i pošalji valjani zapis s `words` riječi. Vraća odgovor /kraj. */
async function playGame(words: number, user = userA) {
  const { start, kraj } = await routes();
  state.userId = user;
  const s = await start(startReq({ resume: false }));
  expect(s.status).toBe(200);
  await backdate(user, 30);
  const { log } = playLog(dailySeed(TODAY), words);
  const res = await kraj(post({ date: TODAY, log }));
  return { res, log, body: await res.json() };
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

  it("start stvara partiju za današnji (zagrebački) dan; resume:true nastavlja istu (isti startedAt)", async () => {
    const { start, stanje } = await routes();
    const a = await (await start(startReq({ resume: false }))).json();
    expect(a).toMatchObject({ date: TODAY, resumed: false });
    const b = await (await start(startReq({ resume: true }))).json();
    expect(b).toMatchObject({ startedAt: a.startedAt, resumed: true });
    expect((await state.db.query("select 1 from public.games")).rows).toHaveLength(1);
    const s = await (await stanje(getReq(TODAY))).json();
    expect(s).toMatchObject({ playing: true, startedAt: a.startedAt, best: null, gamesToday: 0 });
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

  it("bez tijela zahtjeva start se ponaša kao resume:false", async () => {
    const { start } = await routes();
    expect((await start(startReq())).status).toBe(200);
  });

  it("najviše 300 partija po igraču i danu (zaštita baze): sljedeća dobiva 429", async () => {
    const { start } = await routes();
    await state.db.query(
      "insert into public.games (user_id, challenge_date, challenge_number, status, attempt_no) select $1, $2::date, 1, 'abandoned', g from generate_series(1, 300) g",
      [userA, TODAY],
    );
    expect((await start(startReq({ resume: false }))).status).toBe(429);
    // igrač B nije pogođen
    state.userId = userB;
    expect((await start(startReq({ resume: false }))).status).toBe(200);
  });
});

describe("/api/igra/kraj: server ponovno odigrava partiju", () => {
  it("valjan zapis → server računa bodove i upisuje rezultat, niz i ljestvicu; vraća info o najboljem", async () => {
    const { stanje } = await routes();
    const { res, body } = await playGame(9);
    expect(res.status).toBe(200);
    const g = playLog(dailySeed(TODAY), 9).state;
    expect(body.result.score).toBe(g.score);
    expect(body.result.words).toBe(9);
    expect(body).toMatchObject({ dayBest: true, allTimeBest: true, gamesToday: 1, bestToday: g.score });
    const sc = (await state.db.query<{ points: number; game_id: string }>("select points, game_id from public.scores")).rows;
    expect(sc).toEqual([{ points: g.score, game_id: body.result.id }]);
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
    expect(st.best.score).toBe(first.result.score); // najbolji je i dalje prvi
    expect(st.gamesToday).toBe(2);

    const better = (await playGame(15)).body;
    expect(better.result.score).toBeGreaterThan(first.result.score);
    expect(better).toMatchObject({ dayBest: true, allTimeBest: true, gamesToday: 3, bestToday: better.result.score });
    st = await (await stanje(getReq(TODAY))).json();
    expect(st.best.score).toBe(better.result.score);

    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(3); // svaka partija ima svoj red
    expect((await state.db.query<{ current_streak: number }>("select current_streak from public.streaks")).rows[0].current_streak).toBe(1); // niz se ne udvostručuje
  });

  it("klijent ne može nametnuti bodove: polje score u zapisu i tijelu se ignorira", async () => {
    const { start, kraj } = await routes();
    await start(startReq({ resume: false }));
    await backdate(userA, 30);
    const { log, state: g } = playLog(dailySeed(TODAY), 5);
    const forged = log.map((e) => ({ ...e, score: 999999 }));
    const res = await kraj(post({ date: TODAY, log: forged, score: 999999, points: 999999 }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.score).toBe(g.score);
    expect((await state.db.query<{ points: number }>("select points from public.scores")).rows[0].points).toBe(g.score);
  });

  it("slanje je idempotentno: isti zapis ponovno vraća istu partiju i ne dodaje redak", async () => {
    const { kraj } = await routes();
    const { log, body: first } = await playGame(4);
    const again = await (await kraj(post({ date: TODAY, log }))).json();
    expect(again.result.id).toBe(first.result.id);
    expect(again.result.score).toBe(first.result.score);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(1);
  });

  it("drugi (različit) zapis bez aktivne partije se odbija (409): ne može se „poboljšati“ nakon završetka", async () => {
    const { kraj } = await routes();
    await playGame(4);
    const other = playLog(dailySeed(TODAY), 12).log;
    expect((await kraj(post({ date: TODAY, log: other }))).status).toBe(409);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(1);
  });

  it("odbija nevaljan zapis (422), broji neuspjele pokušaje i nakon 5 blokira (429)", async () => {
    const { start, kraj } = await routes();
    await start(startReq({ resume: false }));
    await backdate(userA, 30);
    const { log } = playLog(dailySeed(TODAY), 6);
    const bad = log.map((e, i) => (i === 2 ? { ...e, w: "xqzkvbt" } : e));
    for (let i = 1; i <= 5; i++) expect((await kraj(post({ date: TODAY, log: bad }))).status).toBe(422);
    expect((await state.db.query<{ attempts: number }>("select attempts from public.games")).rows[0].attempts).toBe(5);
    expect((await kraj(post({ date: TODAY, log }))).status).toBe(429); // čak ni valjan zapis više ne prolazi za TU partiju
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(0);
    // ali igrač može odbaciti tu partiju i igrati novu
    expect((await playGame(5)).res.status).toBe(200);
  });

  it("zapis koji traje dulje od stvarno proteklog vremena se odbija", async () => {
    const { start, kraj } = await routes();
    await start(startReq({ resume: false })); // partija je počela prije nekoliko ms, a zapis tvrdi da traje ≈ minutu
    const { log } = playLog(dailySeed(TODAY), 6);
    const r = await kraj(post({ date: TODAY, log }));
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/dulje nego što je partija stvarno trajala/);
  });

  it("zapis za pogrešan dan (drugi seed) se odbija", async () => {
    const { start, kraj } = await routes();
    await start(startReq({ resume: false }));
    await backdate(userA, 30);
    const { log } = playLog(dailySeed("2026-11-11"), 6);
    expect((await kraj(post({ date: TODAY, log }))).status).toBe(422);
  });

  it("bez započete partije 409, neispravno tijelo 400, bez prijave 401", async () => {
    const { kraj } = await routes();
    expect((await kraj(post({ date: TODAY, log: [] }))).status).toBe(409);
    expect((await kraj(post({ date: "x", log: [] }))).status).toBe(400);
    expect((await kraj(new NextRequest("http://localhost/api/igra/kraj", { method: "POST", body: "nije json" }))).status).toBe(400);
    state.userId = null;
    expect((await kraj(post({ date: TODAY, log: [] }))).status).toBe(401);
  });

  it("igrači su međusobno odvojeni: B ne može završiti partiju koju je počeo A", async () => {
    const { start, kraj } = await routes();
    await start(startReq({ resume: false }));
    await backdate(userA, 30);
    state.userId = userB;
    const { log } = playLog(dailySeed(TODAY), 3);
    expect((await kraj(post({ date: TODAY, log }))).status).toBe(409); // B nema partiju
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(0);
  });
});
