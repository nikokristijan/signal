import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Pravi Postgres (PGlite, WebAssembly): primjenjuje supabase/migrations/0001_init.sql na „Supabase-like" okolinu
 * (shema auth, auth.uid(), uloge anon/authenticated/service_role) i provjerava sigurnosni model i logiku.
 * To nije zamjena za probu na pravom Supabase projektu, ali hvata greške u SQL-u i u RLS politikama.
 */
const PRELUDE = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb not null default '{}', is_anonymous boolean not null default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to public;
`;

let db: PGlite;
const ids: Record<string, string> = {};

async function as<T>(user: string | null, fn: () => Promise<T>, role: "authenticated" | "service_role" | "anon" = "authenticated"): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${user ? ids[user] : ""}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function newUser(name: string, username?: string) {
  const meta = username ? JSON.stringify({ username }) : "{}";
  const [u] = await q<{ id: string }>("insert into auth.users (raw_user_meta_data) values ($1::jsonb) returning id", [meta]);
  ids[name] = u.id;
}

/** Odigra (i završi) jednu partiju: server upisuje rezultat. Vraća id partije. */
async function play(user: string, date: string, score: number, words: number, combo = 3): Promise<string> {
  const [g] = await q<{ id: string }>("insert into public.games (user_id, challenge_date, challenge_number) values ($1, $2, 1) returning id", [ids[user], date]);
  await as(
    null,
    () => db.query("select public.bomba_record_result($1, $2, $3, $4, 'riječ', array['riječ'], 2, 20000, '[]'::jsonb, $5)", [g.id, score, words, combo, `hash-${g.id}`]),
    "service_role",
  );
  return g.id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  // Primijeni migracije redom, kao na pravom Supabaseu.
  for (const f of fs.readdirSync(path.join(__dirname, "../supabase/migrations")).sort()) {
    await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8"));
  }
  for (const n of ["ana", "ivo", "mia", "luka"]) await newUser(n);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("migracija i profili", () => {
  it("primjenjuje se bez grešaka i stvara sve tablice", async () => {
    const rows = await q<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' order by 1");
    expect(rows.map((r) => r.table_name)).toEqual(["friendships", "games", "profiles", "scores", "streaks"]);
  });
  it("okidač stvara profil s nasumičnim imenom igracNNNN", async () => {
    const rows = await q<{ username: string; avatar_color: string }>("select username, avatar_color from public.profiles where id = $1", [ids.ana]);
    expect(rows[0].username).toMatch(/^igrac\d{4}$/);
    expect(rows[0].avatar_color).toBeTruthy();
  });
  it("uzima korisničko ime iz metapodataka i rješava sudar imena", async () => {
    await newUser("p1", "kapetan");
    await newUser("p2", "kapetan");
    const [a] = await q<{ username: string }>("select username from public.profiles where id = $1", [ids.p1]);
    const [b] = await q<{ username: string }>("select username from public.profiles where id = $1", [ids.p2]);
    expect(a.username).toBe("kapetan");
    expect(b.username).not.toBe("kapetan");
    expect(b.username).toMatch(/^[a-z0-9_]{3,16}$/);
  });
  it("korisničko ime mora biti 3–16 znakova [a-z0-9_] i jedinstveno", async () => {
    await as("ana", async () => {
      await expect(db.query("update public.profiles set username = 'AB' where id = $1", [ids.ana])).rejects.toThrow();
      await expect(db.query("update public.profiles set username = 'kapetan' where id = $1", [ids.ana])).rejects.toThrow(/unique|duplicate/i);
      await db.query("update public.profiles set username = 'ana_h' where id = $1", [ids.ana]);
    });
    expect((await q<{ username: string }>("select username from public.profiles where id = $1", [ids.ana]))[0].username).toBe("ana_h");
  });
});

describe("RLS: klijent ne može upisati ni vidjeti tuđe", () => {
  it("igrač ne može sam upisati rezultat ni partiju (nema insert politika)", async () => {
    await as("ivo", async () => {
      await expect(db.query("insert into public.scores (user_id, challenge_date, points, words, max_combo) values ($1, '2026-11-10', 99999, 99, 99)", [ids.ivo])).rejects.toThrow(/row-level security/i);
      await expect(db.query("insert into public.games (user_id, challenge_date, challenge_number, status, score) values ($1, '2026-11-10', 12, 'finished', 99999)", [ids.ivo])).rejects.toThrow(/row-level security/i);
      await expect(db.query("insert into public.streaks values ($1, 99, 99, '2026-11-10')", [ids.ivo])).rejects.toThrow(/row-level security/i);
      await expect(db.query("insert into public.friendships values ($1, $2)", [ids.ivo, ids.mia])).rejects.toThrow(/row-level security/i);
    });
  });
  it("igrač ne može promijeniti svoj rezultat niti partiju (update/delete bez efekta)", async () => {
    await play("ivo", "2026-11-01", 300, 15);
    await as("ivo", async () => {
      const upd = await db.query("update public.scores set points = 99999 where user_id = $1", [ids.ivo]);
      expect(upd.affectedRows).toBe(0);
      const upd2 = await db.query("update public.games set score = 99999 where user_id = $1", [ids.ivo]);
      expect(upd2.affectedRows).toBe(0);
      const del = await db.query("delete from public.scores where user_id = $1", [ids.ivo]);
      expect(del.affectedRows).toBe(0);
    });
    expect((await q<{ points: number }>("select points from public.scores where user_id = $1 and challenge_date = '2026-11-01'", [ids.ivo]))[0].points).toBe(300);
  });
  it("igrač čita samo svoje partije i profil", async () => {
    await play("mia", "2026-11-01", 200, 10);
    await as("ivo", async () => {
      expect((await q("select * from public.games")).length).toBe(1);
      expect((await q("select id from public.profiles")).map((r) => (r as { id: string }).id)).toEqual([ids.ivo]);
    });
  });
  it("bomba_record_result smije pozvati samo service_role", async () => {
    for (const role of ["authenticated", "anon"] as const) {
      await expect(
        as("ivo", () => db.query("select public.bomba_record_result($1, 9999, 99, 9, 'x', array['x'], 0, 1, '[]'::jsonb, 'h')", [ids.ivo]), role),
      ).rejects.toThrow(/permission denied/i);
    }
  });
  it("neprijavljeni (anon) ne smije zvati ljestvicu ni prijatelje", async () => {
    await expect(as(null, () => db.query("select * from public.leaderboard('all', '2026-11-10')"), "anon")).rejects.toThrow(/permission denied/i);
    await expect(as(null, () => db.query("select * from public.add_friend('ana_h')"), "anon")).rejects.toThrow(/permission denied/i);
  });
});

describe("upis rezultata, više partija i nizovi", () => {
  it("bomba_record_result zaključava partiju i upisuje score; drugi put baca grešku", async () => {
    const id = await play("ivo", "2026-11-02", 250, 12);
    const g = await q<{ status: string; score: number; words: number; log_hash: string }>("select status, score, words, log_hash from public.games where id = $1", [id]);
    expect(g[0]).toMatchObject({ status: "finished", score: 250, words: 12 });
    expect(g[0].log_hash).toBe(`hash-${id}`);
    await expect(
      as(null, () => db.query("select public.bomba_record_result($1, 5, 1, 1, 'x', array['x'], 0, 1, '[]'::jsonb, 'h')", [id]), "service_role"),
    ).rejects.toThrow(/Nema aktivne partije/);
    expect((await q("select * from public.scores where game_id = $1", [id])).length).toBe(1);
  });
  it("igrač može igrati koliko god puta: više partija istog dana, svaka ima svoj red u scores", async () => {
    const before = (await q("select 1 from public.scores where user_id = $1 and challenge_date = '2026-11-03'", [ids.ivo])).length;
    await play("ivo", "2026-11-03", 100, 5);
    await play("ivo", "2026-11-03", 400, 20);
    await play("ivo", "2026-11-03", 150, 8);
    const rows = await q<{ points: number }>("select points from public.scores where user_id = $1 and challenge_date = '2026-11-03' order by points", [ids.ivo]);
    expect(rows.length).toBe(before + 3);
    expect(rows.map((r) => r.points)).toEqual([100, 150, 400]);
  });
  it("istovremeno može postojati samo jedna nezavršena partija ne vrijedi na razini baze, ali status abandoned je dopušten", async () => {
    const [g] = await q<{ id: string }>("insert into public.games (user_id, challenge_date, challenge_number) values ($1, '2026-11-04', 1) returning id", [ids.ivo]);
    await db.query("update public.games set status = 'abandoned' where id = $1", [g.id]);
    expect((await q<{ status: string }>("select status from public.games where id = $1", [g.id]))[0].status).toBe("abandoned");
    await expect(db.query("update public.games set status = 'nesto' where id = $1", [g.id])).rejects.toThrow(/check/i);
    // odbačena partija se ne može završiti
    await expect(
      as(null, () => db.query("select public.bomba_record_result($1, 9, 1, 1, 'x', array['x'], 0, 1, '[]'::jsonb, 'h')", [g.id]), "service_role"),
    ).rejects.toThrow(/Nema aktivne partije/);
  });
  it("niz dana: uzastopni dani povećavaju, propušteni dan resetira, druga partija istog dana ne mijenja niz", async () => {
    await play("luka", "2026-11-05", 100, 5);
    await play("luka", "2026-11-06", 100, 5);
    await play("luka", "2026-11-07", 100, 5);
    await play("luka", "2026-11-07", 90, 4); // druga partija istog dana
    let [s] = await q<{ current_streak: number; longest_streak: number }>("select * from public.streaks where user_id = $1", [ids.luka]);
    expect(s).toMatchObject({ current_streak: 3, longest_streak: 3 });
    await play("luka", "2026-11-09", 100, 5);
    [s] = await q("select * from public.streaks where user_id = $1", [ids.luka]);
    expect(s).toMatchObject({ current_streak: 1, longest_streak: 3 });
  });
});

describe("ljestvice: gleda se NAJBOLJI rezultat (high score), ne zbroj", () => {
  beforeAll(async () => {
    // 2026-11-10 je utorak; tjedan počinje 2026-11-09
    await play("ana", "2026-11-10", 120, 10);
    await play("ana", "2026-11-10", 500, 30); // najbolja danas
    await play("ana", "2026-11-10", 80, 6);
    await play("ivo", "2026-11-10", 800, 40);
    await play("mia", "2026-11-10", 800, 40);
    await play("luka", "2026-11-10", 300, 20);
    await play("ana", "2026-11-09", 400, 25);
    await play("ana", "2026-11-09", 350, 22);
  });
  const lb = (scope: string, uid = "ana") => as(uid, () => q<{ rank: string; username: string; points: string; words: string }>("select * from public.leaderboard($1, '2026-11-10')", [scope]));

  it("dnevna: svaki igrač jednom, s najboljom partijom; istovjetni rezultati dijele mjesto", async () => {
    const rows = await lb("daily");
    expect(rows.map((r) => Number(r.points))).toEqual([800, 800, 500, 300]);
    expect(rows.map((r) => Number(r.rank))).toEqual([1, 1, 3, 4]);
    expect(rows.filter((r) => r.username === "ana_h")).toHaveLength(1); // 3 partije, jedan redak
  });
  it("tjedna = najbolja partija od ponedjeljka (NE zbroj); ukupna = high score svih vremena", async () => {
    const week = await lb("weekly");
    expect(Number(week.find((r) => r.username === "ana_h")?.points)).toBe(500); // ne 500 + 400 + …
    const all = await lb("all");
    expect(Number(all.find((r) => r.username === "ana_h")?.points)).toBe(500);
    // ivo: 800 danas, 400 (03.11.), 300 (01.11.) → high score 800, ne zbroj
    expect(Math.max(...all.map((r) => Number(r.points)))).toBe(800);
  });
  it("kod jednakih bodova pobjeđuje partija s više riječi", async () => {
    await play("luka", "2026-11-10", 500, 35); // ista točka kao ana (500), ali više riječi
    const rows = await lb("daily");
    const order = rows.filter((r) => Number(r.points) === 500).map((r) => Number(r.words));
    expect(order).toEqual([35, 30]);
  });
  it("prijatelji: samo ti i prijatelji, samo današnji najbolji rezultati", async () => {
    const ivoName = (await q<{ username: string }>("select username from public.profiles where id = $1", [ids.ivo]))[0].username;
    await as("ana", () => db.query("select * from public.add_friend($1)", [ivoName]));
    const rows = await lb("friends");
    expect(rows.map((r) => Number(r.points)).sort((a, b) => a - b)).toEqual([500, 800]); // ana (najbolja od 3) i ivo; ne mia/luka
  });
  it("ljestvica ne otkriva ništa osim agregata (nema e-maila ni id-ova partija)", async () => {
    const rows = await lb("all");
    expect(Object.keys(rows[0]).sort()).toEqual(["avatar_color", "points", "rank", "user_id", "username", "words"]);
  });
});

describe("prijatelji", () => {
  it("add_friend je obostran; „duhovi“ i lista prijatelja daju današnje rezultate", async () => {
    const ghosts = await as("ana", () => q<{ username: string; words: number; points: number }>("select * from public.friends_today('2026-11-10')"));
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({ words: 40, points: 800 }); // najbolja današnja partija prijatelja
    const back = await as("ivo", () => q<{ username: string }>("select * from public.friends_today('2026-11-10')"));
    expect(back[0].username).toBe("ana_h"); // obostrano
    const list = await as("ana", () => q<{ today_points: number; best_points: number }>("select * from public.list_friends('2026-11-10')"));
    expect(list[0].today_points).toBe(800);
    expect(Number(list[0].best_points)).toBe(800); // high score, ne zbroj
  });
  it("odbija nepostojećeg, sebe i duplikat", async () => {
    const ivo = (await q<{ username: string }>("select username from public.profiles where id = $1", [ids.ivo]))[0].username;
    await as("ana", async () => {
      await expect(db.query("select * from public.add_friend('nepostoji')")).rejects.toThrow(/Nema igrača/);
      await expect(db.query("select * from public.add_friend('ana_h')")).rejects.toThrow(/To si ti/);
      await expect(db.query("select * from public.add_friend($1)", [ivo])).rejects.toThrow(/već prijatelj/);
    });
  });
  it("remove_friend briše oba smjera", async () => {
    await as("ana", () => db.query("select public.remove_friend($1)", [ids.ivo]));
    expect((await q("select * from public.friendships")).length).toBe(0);
  });
});
