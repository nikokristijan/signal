import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";

/**
 * Lazni Supabase TRANSPORT iznad prave baze (PGlite + prave migracije):
 *  - serverMock  : za API rute (service role bez RLS-a + tko je prijavljen)
 *  - browserMock : klijent preglednika jednog igraca (rpc i from idu kao uloga authenticated uz RLS)
 * Sva SQL logika, RLS i funkcije su prave; lazan je samo nacin na koji se do njih dolazi.
 */
export interface FakeState {
  db: PGlite;
  userId: string | null;
}

export const PRELUDE = `
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    raw_user_meta_data jsonb not null default '{}',
    is_anonymous boolean not null default true,
    email text
  );
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

export async function migrate(db: PGlite) {
  await db.exec(PRELUDE);
  const dir = path.join(__dirname, "../../supabase/migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  }
}

/** PostgREST vraca datume kao YYYY-MM-DD, a vremena kao ISO string; PGlite vraca Date objekte. */
function plain(rows: Array<Record<string, unknown>>) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => {
        if (!(v instanceof Date)) return [k, v];
        const midnight = v.getUTCHours() + v.getUTCMinutes() + v.getUTCSeconds() + v.getUTCMilliseconds() === 0;
        return [k, midnight ? v.toISOString().slice(0, 10) : v.toISOString()];
      }),
    ),
  );
}

/** PGlite ima jedan spoj, a uloga je stanje spoja: izvrsavanje mora biti serijsko (pravi Supabase ima spoj po zahtjevu). */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

/** Izvrsi fn kao zadani korisnik (uloga authenticated, RLS vrijedi) ili kao superkorisnik (service role). */
function run<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  return serial(async () => {
    if (userId === null) return fn();
    await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
    try {
      return await fn();
    } finally {
      await db.exec("reset role;");
    }
  });
}

type Err = { message: string; code?: string };

class Query {
  private op: "select" | "insert" | "update" = "select";
  private filters: Array<[string, unknown]> = [];
  private payload: Record<string, unknown> = {};
  private cols = "*";
  private orderBy: string | null = null;
  constructor(
    private db: PGlite,
    private table: string,
    private userId: string | null,
  ) {}
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
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = `${col} ${opts?.ascending === false ? "desc" : "asc"}`;
    return this;
  }
  private async exec(): Promise<{ data: Array<Record<string, unknown>> | null; error: Err | null }> {
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
    } else {
      sql = `select ${this.cols} from public.${this.table}${where}${this.orderBy ? ` order by ${this.orderBy}` : ""}`;
    }
    try {
      const r = await run(this.db, this.userId, () => this.db.query<Record<string, unknown>>(sql, params));
      return { data: plain(r.rows), error: null };
    } catch (e) {
      const err = e as { message?: string; code?: string };
      return { data: null, error: { message: String(err.message ?? e), code: err.code } };
    }
  }
  async maybeSingle() {
    const r = await this.exec();
    return { data: r.data?.[0] ?? null, error: r.error };
  }
  async single() {
    const r = await this.exec();
    return { data: r.data?.[0] ?? null, error: r.error ?? (r.data?.length ? null : { message: "no rows" }) };
  }
  then(resolve: (v: unknown) => void) {
    return this.exec().then(resolve);
  }
}

async function rpc(db: PGlite, userId: string | null, fn: string, args: Record<string, unknown> = {}) {
  const keys = Object.keys(args);
  const jsonKeys = new Set(["p_log"]);
  try {
    const r = await run(db, userId, () =>
      db.query<Record<string, unknown>>(
        `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}${jsonKeys.has(k) ? "::jsonb" : ""}`).join(", ")})`,
        keys.map((k) => (jsonKeys.has(k) ? JSON.stringify(args[k]) : args[k])),
      ),
    );
    const rows = plain(r.rows);
    // funkcije koje vracaju void daju jedan red s jednim praznim stupcem: PostgREST bi vratio null
    const first = rows[0];
    const isVoid = rows.length === 1 && Object.keys(first).length === 1 && Object.keys(first)[0] === fn && first[fn] === "";
    return { data: isVoid ? null : rows, error: null as Err | null };
  } catch (e) {
    return { data: null, error: { message: String((e as Error).message ?? e) } as Err };
  }
}

/** Za vi.mock("@/lib/supabase/server", ...): API rute. */
export function serverMock(state: FakeState) {
  return {
    createUserClient: async () => ({
      auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
    }),
    createAdminClient: () => ({
      from: (t: string) => new Query(state.db, t, null),
      rpc: (fn: string, args: Record<string, unknown>) => rpc(state.db, null, fn, args),
    }),
  };
}

/** Za vi.mock("@/lib/supabase/browser", ...): klijent preglednika jednog igraca (prijava je stanje klijenta). */
export function browserMock(state: FakeState) {
  return {
    createBrowser: () => {
      let me: string | null = null;
      const userRow = async () => {
        if (!me) return null;
        const r = await run(state.db, null, () =>
          state.db.query<{ id: string; is_anonymous: boolean; email: string | null }>("select id, is_anonymous, email from auth.users where id = $1", [me]),
        );
        return r.rows[0] ?? null;
      };
      return {
        auth: {
          getUser: async () => ({ data: { user: await userRow() } }),
          signInAnonymously: async () => {
            // okidac on_auth_user_created stvara profil
            me = (await run(state.db, null, () => state.db.query<{ id: string }>("insert into auth.users default values returning id"))).rows[0].id;
            return { data: { user: await userRow() }, error: null };
          },
          updateUser: async ({ email }: { email: string }) => {
            if (!me) return { error: { message: "Not signed in" } };
            await run(state.db, null, () => state.db.query("update auth.users set email = $1, is_anonymous = false where id = $2", [email, me]));
            return { error: null };
          },
          signInWithOtp: async () => ({ error: null }),
          signOut: async () => {
            me = null;
          },
        },
        rpc: (fn: string, args?: Record<string, unknown>) => rpc(state.db, me, fn, args),
        from: (t: string) => new Query(state.db, t, me),
      };
    },
  };
}
