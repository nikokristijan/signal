import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Nadogradnja s migracije 0001 (jedna partija dnevno) na 0002 (neograničen broj partija) NA BAZI SA STARIM PODACIMA:
 * rezultati se moraju sačuvati i povezati s partijama, a nove mogućnosti moraju raditi.
 */
const PRELUDE = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to public;
`;
const dir = path.join(__dirname, "../supabase/migrations");
const migration = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");

let db: PGlite;
let a = "";
let b = "";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(migration("0001_init.sql"));
  a = (await db.query<{ id: string }>("insert into auth.users default values returning id")).rows[0].id;
  b = (await db.query<{ id: string }>("insert into auth.users default values returning id")).rows[0].id;
  // STARI način rada: jedna partija po danu, zapisana staronom funkcijom
  for (const [u, d, score, words] of [[a, "2026-11-08", 300, 15], [a, "2026-11-09", 450, 22], [b, "2026-11-09", 200, 10]] as const) {
    await db.query("insert into public.games (user_id, challenge_date, challenge_number) values ($1, $2, 1)", [u, d]);
    await db.query("select public.bomba_record_result($1, $2, $3, $4, 3, 'riječ', array['riječ'], 2, 1000, '[]'::jsonb)", [u, d, score, words]);
  }
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("0001 → 0002", () => {
  it("prije nadogradnje: jedna partija dnevno je pravilo baze", async () => {
    await expect(db.query("insert into public.games (user_id, challenge_date, challenge_number) values ($1, '2026-11-08', 1)", [a])).rejects.toThrow(/unique|duplicate/i);
  });

  it("nadogradnja se primjenjuje i čuva sve stare rezultate, povezane s partijama", async () => {
    await db.exec(migration("0002_neogranicene_partije.sql"));
    const rows = await db.query<{ game_id: string; points: number; challenge_date: string }>("select game_id, points, challenge_date::text from public.scores order by points");
    expect(rows.rows.map((r) => r.points)).toEqual([200, 300, 450]);
    expect(rows.rows.every((r) => r.game_id)).toBe(true);
    const matched = await db.query("select 1 from public.scores s join public.games g on g.id = s.game_id and g.user_id = s.user_id and g.challenge_date = s.challenge_date");
    expect(matched.rows).toHaveLength(3);
  });

  it("nakon nadogradnje se može igrati više partija istog dana", async () => {
    await db.query("insert into public.games (user_id, challenge_date, challenge_number) values ($1, '2026-11-09', 1)", [a]);
    const [g] = (await db.query<{ id: string }>("select id from public.games where user_id = $1 and status = 'playing'", [a])).rows;
    await db.exec("set role service_role");
    await db.query("select public.bomba_record_result($1, 120, 7, 2, 'riječ', array['riječ'], 2, 1000, '[]'::jsonb, 'h')", [g.id]);
    await db.exec("reset role");
    const n = await db.query("select 1 from public.scores where user_id = $1 and challenge_date = '2026-11-09'", [a]);
    expect(n.rows).toHaveLength(2);
  });

  it("ljestvica nakon nadogradnje daje NAJBOLJI rezultat (450), a ne zbroj (570)", async () => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${a}', false); set role authenticated;`);
    const rows = (await db.query<{ points: string }>("select * from public.leaderboard('all', '2026-11-10')")).rows;
    await db.exec("reset role");
    expect(Math.max(...rows.map((r) => Number(r.points)))).toBe(450);
  });

  it("stara funkcija za upis više ne postoji, a nova je i dalje zatvorena za klijente", async () => {
    const fns = (await db.query<{ args: string }>("select pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'bomba_record_result'")).rows;
    expect(fns).toHaveLength(1);
    expect(fns[0].args).toMatch(/^p_game uuid/);
    await db.exec(`select set_config('request.jwt.claim.sub', '${a}', false); set role authenticated;`);
    await expect(db.query("select public.bomba_record_result($1, 9999, 99, 9, 'x', array['x'], 0, 1, '[]'::jsonb, 'h')", [a])).rejects.toThrow(/permission denied/i);
    await db.exec("reset role");
  });

  it("primarni ključ tablice scores je sada game_id (jedan red po partiji)", async () => {
    const pk = (await db.query<{ col: string }>("select a.attname as col from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = 'public.scores'::regclass and i.indisprimary")).rows;
    expect(pk.map((r) => r.col)).toEqual(["game_id"]);
  });
});
