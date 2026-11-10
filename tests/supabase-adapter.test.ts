import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mode } from "@/lib/game/constants";
import { zagrebDateKey } from "@/lib/game/dates";
import { gameSeed } from "@/lib/game/seeds";
import { playLog } from "./helpers";
import { browserMock, migrate, serverMock, type FakeState } from "./fakes/pglite-supabase";

/**
 * Cijeli Supabase tok kroz PRAVI SupabaseRepository (klijentski adapter) -> PRAVE API rute -> PRAVA baza (PGlite + migracije, RLS).
 * Lazan je samo transport (PostgREST/Auth): vidi tests/fakes/pglite-supabase.ts.
 * Dva igraca imaju svaki svoj klijent (svoju prijavu); fetch se preusmjerava na rute kao da je prijavljen onaj tko poziva.
 */
const state = vi.hoisted(() => ({ db: null as unknown as import("@electric-sql/pglite").PGlite, userId: null as string | null }));

vi.mock("@/lib/supabase/server", async () => (await import("./fakes/pglite-supabase")).serverMock(state as FakeState));
vi.mock("@/lib/supabase/browser", async () => (await import("./fakes/pglite-supabase")).browserMock(state as FakeState));

const TODAY = zagrebDateKey();

type Repo = import("@/lib/repo/supabase").SupabaseRepository;
let ana: Repo;
let ivo: Repo;
let anaId = "";
let ivoId = "";

/** Sljedeci API poziv dolazi od ovog igraca. */
let current: string | null = null;
const as = (id: string) => {
  current = id;
  state.userId = id;
};

async function installFetch() {
  const start = (await import("@/app/api/igra/start/route")).POST;
  const kraj = (await import("@/app/api/igra/kraj/route")).POST;
  const stanje = (await import("@/app/api/igra/stanje/route")).GET;
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    state.userId = current;
    const url = new URL(input, "http://localhost");
    const req = new NextRequest(url, { method: init?.method ?? "GET", body: init?.body as string | undefined, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/api/igra/start") return start(req);
    if (url.pathname === "/api/igra/kraj") return kraj(req);
    if (url.pathname === "/api/igra/stanje") return stanje(req);
    return new Response("{}", { status: 404 });
  });
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  state.db = new PGlite();
  await migrate(state.db);
  await installFetch();
  const { SupabaseRepository } = await import("@/lib/repo/supabase");
  ana = new SupabaseRepository("http://supabase.test", "anon");
  ivo = new SupabaseRepository("http://supabase.test", "anon");
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await state.db.close();
});

beforeEach(() => {
  current = null;
  state.userId = null;
});

/** Odigraj partiju (start -> zapis -> kraj) kroz adapter; startedAt se pomakne u proslost da trajanje zapisa bude vjerodostojno. */
async function play(repo: Repo, userId: string, mode: Mode, words: number) {
  as(userId);
  const started = await repo.startGame(mode, TODAY, false);
  if (!started.ok) throw new Error(started.error);
  await state.db.query("update public.games set started_at = now() - interval '30 minutes' where id = $1", [started.value.gameId]);
  const { log } = playLog(gameSeed(mode, TODAY, started.value.gameId), words);
  as(userId);
  return repo.finishGame(mode, TODAY, started.value.gameId, log);
}

describe("prijava i profil", () => {
  it("ensureProfile anonimno prijavi igraca i stvori profil; ponovni poziv vraca isti profil", async () => {
    const a = await ana.ensureProfile();
    const b = await ivo.ensureProfile();
    expect(a).toMatchObject({ anonymous: true, email: null });
    expect(b).toMatchObject({ anonymous: true });
    expect(a!.id).not.toBe(b!.id);
    expect((await ana.ensureProfile())!.id).toBe(a!.id);
    anaId = a!.id;
    ivoId = b!.id;
  });

  it("korisnicko ime: valjano se sprema (mala slova), neispravno i zauzeto se odbijaju", async () => {
    as(anaId);
    const r = await ana.updateProfile({ username: "  Ana_K " });
    expect(r).toMatchObject({ ok: true, value: { username: "ana_k" } });
    expect(await ana.updateProfile({ username: "a" })).toMatchObject({ ok: false });
    expect(await ana.updateProfile({ username: "ima razmak" })).toMatchObject({ ok: false });
    as(ivoId);
    expect(await ivo.updateProfile({ username: "ana_k" })).toEqual({ ok: false, error: "To korisničko ime je zauzeto." });
    expect(await ivo.updateProfile({ username: "ivo_k", avatar: { color: "#4b8b5a" } })).toMatchObject({ ok: true, value: { username: "ivo_k", avatar: { color: "#4b8b5a" } } });
  });

  it("RLS: igrac ne moze izravno mijenjati tudi profil ni upisivati partije/rezultate", async () => {
    as(ivoId);
    const client = (ivo as unknown as { client: { from: (t: string) => any } }).client;
    // update tudeg profila: RLS ne dopusta nijedan redak -> nista se ne promijeni
    await client.from("profiles").update({ username: "hakiran" }).eq("id", anaId);
    const row = (await state.db.query<{ username: string }>("select username from public.profiles where id = $1", [anaId])).rows[0];
    expect(row.username).toBe("ana_k");
    // izravan upis partije ili rezultata nije dopusten
    const g = await client.from("games").insert({ user_id: ivoId, challenge_date: TODAY, challenge_number: 1, status: "finished", score: 99999 });
    expect(g.error).toBeTruthy();
    const s = await client.from("scores").insert({ user_id: ivoId, challenge_date: TODAY, points: 99999 });
    expect(s.error).toBeTruthy();
    expect((await state.db.query("select 1 from public.scores where points = 99999")).rows).toHaveLength(0);
  });
});

describe("prijatelji", () => {
  it("dodavanje po imenu (i s @) je obostrano; samog sebe, nepoznatog i duplikat odbija", async () => {
    as(anaId);
    expect(await ana.addFriend("ana_k", TODAY)).toMatchObject({ ok: false, error: "To si ti!" });
    expect(await ana.addFriend("nepostojeci", TODAY)).toMatchObject({ ok: false });
    const added = await ana.addFriend("@Ivo_K", TODAY);
    expect(added).toMatchObject({ ok: true, value: { username: "ivo_k", todayScore: null, bestScore: 0, trainingBest: 0 } });
    expect(await ana.addFriend("ivo_k", TODAY)).toMatchObject({ ok: false });
    expect((await ana.listFriends(TODAY)).map((f) => f.username)).toEqual(["ivo_k"]);
    as(ivoId);
    expect((await ivo.listFriends(TODAY)).map((f) => f.username)).toEqual(["ana_k"]);
  });

  it("uklanjanje prijatelja brise oba smjera, a ponovno dodavanje opet radi", async () => {
    as(anaId);
    await ana.removeFriend(ivoId);
    expect(await ana.listFriends(TODAY)).toEqual([]);
    as(ivoId);
    expect(await ivo.listFriends(TODAY)).toEqual([]);
    as(anaId);
    expect(await ana.addFriend("ivo_k", TODAY)).toMatchObject({ ok: true });
  });
});

describe("dnevna liga kroz adapter", () => {
  it("start/stanje/kraj: rezultat se sprema, stanje pokazuje najbolji i broj partija", async () => {
    as(anaId);
    expect(await ana.getStatus("daily", TODAY)).toMatchObject({ playing: false, best: null, gamesToday: 0 });
    const r = await play(ana, anaId, "daily", 3);
    expect(r).toMatchObject({ ok: true, value: { result: { words: 3, mode: "daily" }, gamesToday: 1 } });
    as(anaId);
    const st = await ana.getStatus("daily", TODAY);
    expect(st).toMatchObject({ playing: false, gamesToday: 1 });
    expect(st.best?.words).toBe(3);
  });

  it("prijatelji vide jedni druge: duhovi, ljestvica prijatelja i danasnji rezultati", async () => {
    const r = await play(ivo, ivoId, "daily", 6);
    expect(r.ok).toBe(true);
    as(anaId);
    const ghosts = await ana.getGhosts("daily", TODAY);
    expect(ghosts.map((g) => [g.username, g.words])).toEqual([["ivo_k", 6]]);
    const table = await ana.getLeaderboard("daily", "friends", TODAY);
    expect(table.map((e) => [e.rank, e.username, e.isMe])).toEqual([
      [1, "ivo_k", false],
      [2, "ana_k", true],
    ]);
    expect(table[0].points).toBeGreaterThan(table[1].points);
    const friends = await ana.listFriends(TODAY);
    expect(friends[0]).toMatchObject({ username: "ivo_k", todayWords: 6 });
    expect(friends[0].todayScore).toBe(table[0].points);
  });

  it("ljestvice danas/tjedan/svi prikazuju najbolju partiju svakog igraca; listResults vraca samo svoje", async () => {
    as(anaId);
    for (const scope of ["daily", "weekly", "all"] as const) {
      const t = await ana.getLeaderboard("daily", scope, TODAY);
      expect(t.map((e) => e.username)).toEqual(["ivo_k", "ana_k"]);
    }
    const mine = await ana.listResults();
    expect(mine.map((g) => g.words)).toEqual([3]);
    expect(mine[0]).toMatchObject({ mode: "daily", date: TODAY });
  });

  it("vise partija: u ljestvici ostaje najbolja, ne zadnja ni zbroj", async () => {
    as(anaId);
    const worse = await play(ana, anaId, "daily", 2);
    expect(worse.ok).toBe(true);
    const better = await play(ana, anaId, "daily", 9);
    expect(better.ok).toBe(true);
    as(anaId);
    const table = await ana.getLeaderboard("daily", "daily", TODAY);
    expect(table.map((e) => [e.username, e.words])).toEqual([
      ["ana_k", 9],
      ["ivo_k", 6],
    ]);
    expect((await ana.getStatus("daily", TODAY)).gamesToday).toBe(3);
    expect((await ana.listResults()).map((g) => g.words).sort((a, b) => a - b)).toEqual([2, 3, 9]);
  });
});

describe("trening liga kroz adapter", () => {
  it("trening je odvojena liga: ne dira dnevnu ljestvicu, ima svoje duhove i svoj najbolji", async () => {
    const r = await play(ivo, ivoId, "training", 5);
    expect(r).toMatchObject({ ok: true, value: { result: { mode: "training", words: 5 } } });
    as(anaId);
    const ghosts = await ana.getGhosts("training", TODAY);
    expect(ghosts.map((g) => [g.username, g.words])).toEqual([["ivo_k", 5]]);
    // dnevna ljestvica ostaje nepromijenjena
    expect((await ana.getLeaderboard("daily", "daily", TODAY)).map((e) => [e.username, e.words])).toEqual([
      ["ana_k", 9],
      ["ivo_k", 6],
    ]);
    // trening ljestvica prijatelja: samo Ivo (Ana jos nije igrala trening)
    expect((await ana.getLeaderboard("training", "friends", TODAY)).map((e) => [e.username, e.words])).toEqual([["ivo_k", 5]]);
    const friends = await ana.listFriends(TODAY);
    expect(friends[0].trainingBest).toBeGreaterThan(0);
  });

  it("trening seed dodjeljuje server: dva starta daju razlicite partije, a krivi gameId se odbija", async () => {
    as(anaId);
    const a = await ana.startGame("training", TODAY, false);
    as(anaId);
    const b = await ana.startGame("training", TODAY, false);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.gameId).not.toBe(b.value.gameId);
    await state.db.query("update public.games set started_at = now() - interval '30 minutes' where id = $1", [b.value.gameId]);
    // zapis odigran za seed prve partije ne vrijedi za drugu
    const { log } = playLog(gameSeed("training", TODAY, a.value.gameId), 4);
    as(anaId);
    const bad = await ana.finishGame("training", TODAY, b.value.gameId, log);
    expect(bad.ok).toBe(false);
  });

  it("nastavak (resume) vraca istu nezavrsenu partiju", async () => {
    as(anaId);
    const first = await ana.startGame("training", TODAY, false);
    as(anaId);
    const again = await ana.startGame("training", TODAY, true);
    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) expect(again.value).toMatchObject({ gameId: first.value.gameId, resumed: true });
  });
});

describe("granicni slucajevi", () => {
  it("nepoznati igrac bez prijave dobiva 401 (rezultat se ne sprema)", async () => {
    const before = (await state.db.query("select 1 from public.scores")).rows.length;
    current = null;
    const r = await ana.startGame("daily", TODAY, false);
    expect(r.ok).toBe(false);
    expect((await state.db.query("select 1 from public.scores")).rows.length).toBe(before);
  });

  it("izmisljeni zapis (previse riječi u prekratkom vremenu) se ne sprema", async () => {
    as(anaId);
    const s = await ana.startGame("daily", TODAY, false);
    if (!s.ok) throw new Error(s.error);
    // partija je upravo pocela, a zapis traje minutama: server mora odbiti
    const { log } = playLog(gameSeed("daily", TODAY, s.value.gameId), 12);
    as(anaId);
    const r = await ana.finishGame("daily", TODAY, s.value.gameId, log);
    expect(r.ok).toBe(false);
    expect((await state.db.query("select 1 from public.scores where points > 0 and game_id = $1", [s.value.gameId])).rows).toHaveLength(0);
  });
});
