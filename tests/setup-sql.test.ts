import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * supabase/setup.sql je jedna datoteka za lijepljenje u Supabase SQL editor na PRAZNOM projektu.
 * Mora biti usklađena s pojedinačnim migracijama i dati ISTU shemu kao primjena migracija redom.
 */
const root = path.join(__dirname, "../supabase");
const PRELUDE = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
`;
const migrations = () => fs.readdirSync(path.join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();

async function describeSchema(db: PGlite) {
  const cols = (await db.query<{ t: string; c: string; ty: string }>("select table_name as t, column_name as c, data_type as ty from information_schema.columns where table_schema = 'public' order by 1, 2")).rows;
  const fns = (await db.query<{ f: string }>("select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1")).rows;
  const policies = (await db.query<{ p: string }>("select tablename || ':' || policyname as p from pg_policies where schemaname = 'public' order by 1")).rows;
  const grants = (await db.query<{ g: string }>("select p.proname || ':' || coalesce(array_to_string(array(select r.rolname from pg_roles r where r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.rolname, p.oid, 'execute') order by 1), ','), '') as g from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1")).rows;
  return { cols, fns, policies, grants };
}

describe("supabase/setup.sql", () => {
  it("postoji i sadrži sve migracije u redoslijedu (usklađeno: ako padne, pokreni npm run sql:setup)", () => {
    const setup = fs.readFileSync(path.join(root, "setup.sql"), "utf8");
    let last = -1;
    for (const f of migrations()) {
      const body = fs.readFileSync(path.join(root, "migrations", f), "utf8").trimEnd();
      const i = setup.indexOf(body);
      expect(i, `${f} nije u setup.sql`).toBeGreaterThan(last);
      last = i;
    }
  });

  it("primijenjen sam na praznu bazu daje ISTU shemu, politike i ovlasti kao migracije redom", async () => {
    const a = new PGlite();
    const b = new PGlite();
    await a.exec(PRELUDE);
    await b.exec(PRELUDE);
    await a.exec(fs.readFileSync(path.join(root, "setup.sql"), "utf8"));
    for (const f of migrations()) await b.exec(fs.readFileSync(path.join(root, "migrations", f), "utf8"));
    expect(await describeSchema(a)).toEqual(await describeSchema(b));
    await a.close();
    await b.close();
  });

  it("nakon setup.sql sve funkcije koje aplikacija zove postoje, a klijent ne smije upisivati rezultate", async () => {
    const db = new PGlite();
    await db.exec(PRELUDE);
    await db.exec(fs.readFileSync(path.join(root, "setup.sql"), "utf8"));
    const names = (await db.query<{ n: string }>("select distinct proname as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'")).rows.map((r) => r.n);
    for (const fn of ["leaderboard", "friends_ghosts", "list_friends", "add_friend", "remove_friend", "bomba_record_result"]) expect(names, fn).toContain(fn);
    await db.exec("set role authenticated");
    await expect(db.query("select public.bomba_record_result(gen_random_uuid(), 1, 1, 1, 'x', array['x'], 0, 1, '[]'::jsonb, 'h')")).rejects.toThrow(/permission denied/i);
    await db.close();
  });
});
