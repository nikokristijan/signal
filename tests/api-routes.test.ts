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
        return { data: r.rows, error: null };
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
  await state.db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations/0001_init.sql"), "utf8"));
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

/** Pomakni početak partije u prošlost da zapis koji traje minutama bude vjerodostojan. */
const backdate = (user: string, minutes: number) =>
  state.db.query("update public.games set started_at = now() - ($1 || ' minutes')::interval where user_id = $2", [String(minutes), user]);

describe("/api/igra/start i /stanje", () => {
  it("bez prijave 401, bez Supabasea (demo) 404", async () => {
    const { start, stanje } = await routes();
    state.userId = null;
    expect((await start()).status).toBe(401);
    expect((await stanje(getReq(TODAY))).status).toBe(401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await start()).status).toBe(404);
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  });

  it("start stvara partiju za današnji (zagrebački) dan; ponovni start je idempotentan i vraća isti startedAt", async () => {
    const { start, stanje } = await routes();
    const a = await (await start()).json();
    expect(a).toMatchObject({ date: TODAY, state: "playing" });
    const b = await (await start()).json();
    expect(b.startedAt).toBe(a.startedAt);
    expect((await state.db.query("select 1 from public.games")).rows).toHaveLength(1);
    const s = await (await stanje(getReq(TODAY))).json();
    expect(s).toMatchObject({ state: "playing", startedAt: a.startedAt });
    expect((await (await stanje(getReq("2026-01-01"))).json()).state).toBe("new");
    expect((await stanje(getReq("nije-datum"))).status).toBe(400);
  });
});

describe("/api/igra/kraj: server ponovno odigrava partiju", () => {
  it("valjan zapis → server računa bodove i upisuje rezultat, niz i ljestvicu", async () => {
    const { start, kraj, stanje } = await routes();
    await start();
    await backdate(userA, 30);
    const { log, state: g } = playLog(dailySeed(TODAY), 9);
    const res = await kraj(post({ date: TODAY, log }));
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result.score).toBe(g.score);
    expect(result.words).toBe(9);

    const sc = (await state.db.query<{ points: number; words: number }>("select points, words from public.scores where user_id = $1", [userA])).rows;
    expect(sc).toEqual([{ points: g.score, words: 9 }]);
    expect((await state.db.query<{ current_streak: number }>("select current_streak from public.streaks where user_id = $1", [userA])).rows[0].current_streak).toBe(1);
    expect((await (await stanje(getReq(TODAY))).json()).state).toBe("finished");
  });

  it("klijent ne može nametnuti bodove: polje score u zapisu i tijelu se ignorira", async () => {
    const { start, kraj } = await routes();
    await start();
    await backdate(userA, 30);
    const { log, state: g } = playLog(dailySeed(TODAY), 5);
    const forged = log.map((e) => ({ ...e, score: 999999 }));
    const res = await kraj(post({ date: TODAY, log: forged, score: 999999, points: 999999 }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.score).toBe(g.score);
    expect((await state.db.query<{ points: number }>("select points from public.scores")).rows[0].points).toBe(g.score);
  });

  it("slanje je idempotentno: drugi poziv vraća isti rezultat i ne dira bodove", async () => {
    const { start, kraj } = await routes();
    await start();
    await backdate(userA, 30);
    const { log } = playLog(dailySeed(TODAY), 4);
    const first = await (await kraj(post({ date: TODAY, log }))).json();
    const other = playLog(dailySeed(TODAY), 12).log; // pokušaj „poboljšanja" nakon završetka
    const second = await (await kraj(post({ date: TODAY, log: other }))).json();
    expect(second.result.score).toBe(first.result.score);
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(1);
  });

  it("odbija nevaljan zapis (422), broji neuspjele pokušaje i nakon 5 blokira (429)", async () => {
    const { start, kraj } = await routes();
    await start();
    await backdate(userA, 30);
    const { log } = playLog(dailySeed(TODAY), 6);
    const bad = log.map((e, i) => (i === 2 ? { ...e, w: "xqzkvbt" } : e));
    for (let i = 1; i <= 5; i++) {
      const r = await kraj(post({ date: TODAY, log: bad }));
      expect(r.status).toBe(422);
    }
    expect((await state.db.query<{ attempts: number }>("select attempts from public.games")).rows[0].attempts).toBe(5);
    expect((await kraj(post({ date: TODAY, log }))).status).toBe(429); // čak ni valjan zapis više ne prolazi
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(0);
  });

  it("zapis koji traje dulje od stvarno proteklog vremena se odbija", async () => {
    const { start, kraj } = await routes();
    await start(); // partija je počela PRIJE nekoliko ms, a zapis tvrdi da traje ≈ minutu
    const { log } = playLog(dailySeed(TODAY), 6);
    const r = await kraj(post({ date: TODAY, log }));
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/dulje nego što je partija stvarno trajala/);
  });

  it("zapis za pogrešan dan (drugi seed) se odbija", async () => {
    const { start, kraj } = await routes();
    await start();
    await backdate(userA, 30);
    const { log } = playLog(dailySeed("2026-11-11"), 6);
    expect((await kraj(post({ date: TODAY, log }))).status).toBe(422);
  });

  it("bez započete partije 409, bez prijave 401, neispravno tijelo 400", async () => {
    const { kraj } = await routes();
    expect((await kraj(post({ date: TODAY, log: [] }))).status).toBe(409);
    expect((await kraj(post({ date: "x", log: [] }))).status).toBe(400);
    expect((await kraj(new NextRequest("http://localhost/api/igra/kraj", { method: "POST", body: "nije json" }))).status).toBe(400);
    state.userId = null;
    expect((await kraj(post({ date: TODAY, log: [] }))).status).toBe(401);
  });

  it("igrači su međusobno odvojeni: B ne može završiti partiju koju je počeo A", async () => {
    const { start, kraj } = await routes();
    await start();
    await backdate(userA, 30);
    state.userId = userB;
    const { log } = playLog(dailySeed(TODAY), 3);
    expect((await kraj(post({ date: TODAY, log }))).status).toBe(409); // B nema partiju
    expect((await state.db.query("select 1 from public.scores")).rows).toHaveLength(0);
  });
});
