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

async function play(user: string, date: string, score: number, words: number, combo = 3) {
  await db.query("insert into public.games (user_id, challenge_date, challenge_number) values ($1, $2, 1)", [ids[user], date]);
  await as(
    null,
    () => db.query("select public.bomba_record_result($1, $2, $3, $4, $5, 'riječ', array['riječ'], 2, 20000, '[]'::jsonb)", [ids[user], date, score, words, combo]),
    "service_role",
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations/0001_init.sql"), "utf8"));
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
      await expect(as("ivo", () => db.query("select public.bomba_record_result($1, '2026-11-02', 9999, 99, 9, 'x', array['x'], 0, 1, '[]'::jsonb)", [ids.ivo]), role)).rejects.toThrow(/permission denied/i);
    }
  });
  it("neprijavljeni (anon) ne smije zvati ljestvicu ni prijatelje", async () => {
    await expect(as(null, () => db.query("select * from public.leaderboard('all', '2026-11-10')"), "anon")).rejects.toThrow(/permission denied/i);
    await expect(as(null, () => db.query("select * from public.add_friend('ana_h')"), "anon")).rejects.toThrow(/permission denied/i);
  });
});

describe("upis rezultata i nizovi", () => {
  it("bomba_record_result zaključava partiju, upisuje score i niz; drugi put baca grešku", async () => {
    const g = await q<{ status: string; score: number; words: number }>("select status, score, words from public.games where user_id = $1 and challenge_date = '2026-11-01'", [ids.ivo]);
    expect(g[0]).toMatchObject({ status: "finished", score: 300, words: 15 });
    await expect(
      as(null, () => db.query("select public.bomba_record_result($1, '2026-11-01', 5, 1, 1, 'x', array['x'], 0, 1, '[]'::jsonb)", [ids.ivo]), "service_role"),
    ).rejects.toThrow(/Nema aktivne partije/);
    expect((await q<{ points: number }>("select points from public.scores where user_id = $1", [ids.ivo])).length).toBe(1);
  });
  it("jedan rangirani pokušaj dnevno (unique po igraču i danu)", async () => {
    await expect(db.query("insert into public.games (user_id, challenge_date, challenge_number) values ($1, '2026-11-01', 3)", [ids.ivo])).rejects.toThrow(/unique|duplicate/i);
  });
  it("niz: uzastopni dani povećavaju, propušteni dan resetira", async () => {
    await play("luka", "2026-11-05", 100, 5);
    await play("luka", "2026-11-06", 100, 5);
    await play("luka", "2026-11-07", 100, 5);
    let [s] = await q<{ current_streak: number; longest_streak: number }>("select * from public.streaks where user_id = $1", [ids.luka]);
    expect(s).toMatchObject({ current_streak: 3, longest_streak: 3 });
    await play("luka", "2026-11-09", 100, 5);
    [s] = await q("select * from public.streaks where user_id = $1", [ids.luka]);
    expect(s).toMatchObject({ current_streak: 1, longest_streak: 3 });
  });
});

describe("ljestvice", () => {
  beforeAll(async () => {
    // 2026-11-10 je utorak; tjedan počinje 2026-11-09
    await play("ana", "2026-11-10", 500, 30);
    await play("ivo", "2026-11-10", 800, 40);
    await play("mia", "2026-11-10", 800, 40);
    await play("luka", "2026-11-10", 300, 20);
    await play("ana", "2026-11-09", 400, 25);
  });
  const lb = (scope: string, uid = "ana") => as(uid, () => q<{ rank: string; username: string; points: string; words: string }>("select * from public.leaderboard($1, '2026-11-10')", [scope]));

  it("dnevna: poredak po bodovima, istovjetni rezultati dijele mjesto", async () => {
    const rows = await lb("daily");
    expect(rows.map((r) => Number(r.points))).toEqual([800, 800, 500, 300]);
    expect(rows.map((r) => Number(r.rank))).toEqual([1, 1, 3, 4]);
  });
  it("tjedna zbraja od ponedjeljka, ukupna sve dane", async () => {
    const week = await lb("weekly");
    expect(Number(week.find((r) => r.username === "ana_h")?.points)).toBe(900); // 500 + 400
    expect(week.some((r) => r.username.startsWith("igrac") && Number(r.points) === 800)).toBe(true); // ivo ne uključuje 11-01 (300)
    const all = await lb("all");
    expect(Math.max(...all.map((r) => Number(r.points)))).toBe(1100); // ivo: 300 + 800
  });
  it("prijatelji: samo ti i prijatelji, samo današnji rezultati", async () => {
    const ivoName = (await q<{ username: string }>("select username from public.profiles where id = $1", [ids.ivo]))[0].username;
    await as("ana", () => db.query("select * from public.add_friend($1)", [ivoName]));
    const rows = await lb("friends");
    expect(rows.map((r) => Number(r.points)).sort((a, b) => a - b)).toEqual([500, 800]); // ana i ivo, ne mia/luka
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
    expect(ghosts[0]).toMatchObject({ words: 40, points: 800 });
    const back = await as("ivo", () => q<{ username: string }>("select * from public.friends_today('2026-11-10')"));
    expect(back[0].username).toBe("ana_h"); // obostrano
    const list = await as("ana", () => q<{ today_points: number; total_points: string }>("select * from public.list_friends('2026-11-10')"));
    expect(list[0].today_points).toBe(800);
    expect(Number(list[0].total_points)).toBe(1100);
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
