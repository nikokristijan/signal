import { AVATAR_KEYS } from "../avatars";
import type { Mode } from "../game/constants";
import type { Dictionary } from "../dict/dictionary";
import { loadDictionary } from "../dict/loader";
import { challengeNumber, LAUNCH_DATE } from "../game/dates";
import { checkElapsed, replayLog } from "../game/replay";
import { gameSeed } from "../game/seeds";
import { better, bestOf } from "../game/results";
import type { AvatarSpec, FinishInfo, FriendEntry, GameResult, Ghost, LeaderboardEntry, LeaderboardScope, LogEntry, Profile, Result } from "../game/types";
import { DEFAULT_FRIENDS, MOCK_USERS, mockDay, mockRange, rangeFor } from "./mock-community";
import type { BombRepository, LeagueStatus, StartedGame } from "./types";

const STORAGE_KEY = "bomba:v1";
export const USERNAME_RE = /^[a-z0-9_]{3,16}$/;

interface Stored {
  profile: Profile | null;
  /** Sve završene partije (koliko god ih bilo). */
  games: GameResult[];
  /** Nezavršena partija po ligi: dnevna po danu ("daily:YYYY-MM-DD"), trening samo jedna ("training"). */
  playing: Record<string, { startedAt: number; gameId: string }>;
  friends: string[];
}

/** localStorage može baciti iznimku (privatni način): tada se podaci drže samo u memoriji. */
function createStorage() {
  let memory: string | null = null;
  return {
    read(): string | null {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return memory;
      }
    },
    write(v: string) {
      memory = v;
      try {
        window.localStorage.setItem(STORAGE_KEY, v);
      } catch {
        /* samo memorija */
      }
    },
  };
}

const playKey = (mode: Mode, date: string) => (mode === "daily" ? `daily:${date}` : "training");

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class LocalRepository implements BombRepository {
  readonly mode = "local" as const;
  private storage = createStorage();

  /** `dictLoader` se može zamijeniti u testovima (u Nodeu nema fetch-a na /dict/hr.bin.gz). */
  constructor(private dictLoader: () => Promise<Dictionary> = loadDictionary) {}

  private load(): Stored {
    const raw = this.storage.read();
    if (raw) {
      try {
        const p = JSON.parse(raw) as Partial<Stored> & { results?: Record<string, GameResult> };
        // starije inačice: jedna partija po danu; partije bez lige su dnevne; nezavršena partija bila je samo broj (ms)
        const legacy = p.results ? Object.values(p.results).map((r) => ({ ...r, id: r.id ?? uuid() })) : [];
        const games = (p.games ?? legacy).map((g) => ({ ...g, mode: (g.mode ?? "daily") as Mode }));
        const playing: Stored["playing"] = {};
        for (const [k, v] of Object.entries(p.playing ?? {})) {
          if (typeof v === "number") playing[k.includes(":") || k === "training" ? k : `daily:${k}`] = { startedAt: v, gameId: uuid() };
          else playing[k] = v;
        }
        return { profile: p.profile ?? null, games, playing, friends: p.friends ?? [...DEFAULT_FRIENDS] };
      } catch {
        /* oštećeno: kreni ispočetka */
      }
    }
    return { profile: null, games: [], playing: {}, friends: [...DEFAULT_FRIENDS] };
  }

  private save(s: Stored) {
    this.storage.write(JSON.stringify(s));
  }

  async ensureProfile(): Promise<Profile> {
    const s = this.load();
    if (s.profile) return s.profile;
    const taken = new Set(MOCK_USERS.map((u) => u.username));
    let username = "";
    do username = `igrac${Math.floor(1000 + Math.random() * 9000)}`;
    while (taken.has(username));
    const profile: Profile = { id: uuid(), username, avatar: { color: AVATAR_KEYS[Math.floor(Math.random() * AVATAR_KEYS.length)] }, anonymous: true };
    this.save({ ...s, profile });
    return profile;
  }

  async updateProfile(patch: { username?: string; avatar?: AvatarSpec }): Promise<Result<Profile>> {
    const s = this.load();
    if (!s.profile) return { ok: false, error: "Profil još ne postoji." };
    let username = s.profile.username;
    if (patch.username !== undefined) {
      username = patch.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) return { ok: false, error: "3–16 znakova: mala slova, brojevi ili _." };
      if (MOCK_USERS.some((u) => u.username === username)) return { ok: false, error: "To korisničko ime je zauzeto." };
    }
    const profile = { ...s.profile, username, avatar: patch.avatar ?? s.profile.avatar };
    this.save({ ...s, profile });
    return { ok: true, value: profile };
  }

  async getStatus(mode: Mode, date: string): Promise<LeagueStatus> {
    const s = this.load();
    const today = s.games.filter((g) => g.mode === mode && g.date === date);
    const playing = s.playing[playKey(mode, date)];
    return {
      mode,
      date,
      number: challengeNumber(date),
      playing: Boolean(playing),
      startedAt: playing?.startedAt,
      gameId: playing?.gameId,
      best: bestOf(today),
      gamesToday: today.length,
    };
  }

  async startGame(mode: Mode, date: string, resume: boolean): Promise<Result<StartedGame>> {
    const s = this.load();
    const key = playKey(mode, date);
    const current = s.playing[key];
    if (resume && current) return { ok: true, value: { startedAt: current.startedAt, resumed: true, gameId: current.gameId } };
    // gameId dodjeljuje „server" (ovdje lokalni repozitorij). Trening: iz njega proizlazi niz slogova.
    const next = { startedAt: Date.now(), gameId: uuid() };
    this.save({ ...s, playing: { ...s.playing, [key]: next } });
    return { ok: true, value: { startedAt: next.startedAt, resumed: false, gameId: next.gameId } };
  }

  /** Ovdje lokalni „server": isti replay i iste provjere kao API ruta u Supabase načinu. */
  async finishGame(mode: Mode, date: string, gameId: string, log: LogEntry[]): Promise<Result<FinishInfo>> {
    const s = this.load();
    const key = playKey(mode, date);
    const current = s.playing[key];
    if (!current || current.gameId !== gameId) return { ok: false, error: "Nema aktivne partije." };
    const dict = await this.dictLoader();
    const rep = replayLog(gameSeed(mode, date, gameId), log, dict);
    if (!rep.ok) return rep;
    const elapsed = checkElapsed(rep.value.summary.durationMs, current.startedAt, Date.now());
    if (!elapsed.ok) return elapsed;

    const result: GameResult = { ...rep.value.summary, id: gameId, mode, date, number: challengeNumber(date), finishedAt: new Date().toISOString() };
    const league = s.games.filter((g) => g.mode === mode);
    const todayBefore = league.filter((g) => g.date === date);
    const bestBefore = bestOf(todayBefore);
    const allBefore = bestOf(league);
    const { [key]: _done, ...playing } = s.playing;
    this.save({ ...s, games: [...s.games, result], playing });
    return {
      ok: true,
      value: {
        result,
        bestToday: Math.max(result.score, bestBefore?.score ?? 0),
        dayBest: !bestBefore || better(result, bestBefore),
        allTimeBest: !allBefore || better(result, allBefore),
        gamesToday: todayBefore.length + 1,
      },
    };
  }

  async listResults() {
    return [...this.load().games].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  }

  private friendEntry(u: (typeof MOCK_USERS)[number], date: string): FriendEntry {
    const today = mockDay(u, date);
    return {
      userId: u.id,
      username: u.username,
      avatar: u.avatar,
      todayWords: today?.words ?? null,
      todayScore: today?.score ?? null,
      bestScore: mockRange(u, LAUNCH_DATE, date).score,
      trainingBest: mockRange(u, LAUNCH_DATE, date, "training").score,
      simulated: true,
    };
  }

  async listFriends(date: string) {
    return this.load()
      .friends.map((n) => MOCK_USERS.find((u) => u.username === n))
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => this.friendEntry(u, date));
  }

  async addFriend(username: string, date: string): Promise<Result<FriendEntry>> {
    const name = username.trim().replace(/^@/, "").toLowerCase();
    const s = this.load();
    if (!name) return { ok: false, error: "Upiši korisničko ime." };
    if (s.profile?.username === name) return { ok: false, error: "To si ti!" };
    const u = MOCK_USERS.find((x) => x.username === name);
    if (!u) return { ok: false, error: `Nema igrača „${name}". U demo načinu postoje samo simulirani igrači (npr. ivan, marija, luka); prave prijatelje možeš dodavati kad je aplikacija spojena na Supabase.` };
    if (s.friends.includes(name)) return { ok: false, error: `${name} ti je već prijatelj.` };
    this.save({ ...s, friends: [...s.friends, name] });
    return { ok: true, value: this.friendEntry(u, date) };
  }

  async removeFriend(userId: string) {
    const s = this.load();
    const name = userId.replace(/^mock-/, "");
    this.save({ ...s, friends: s.friends.filter((f) => f !== name) });
  }

  async getGhosts(mode: Mode, date: string): Promise<Ghost[]> {
    const out: Ghost[] = [];
    const s = this.load();
    for (const n of s.friends) {
      const u = MOCK_USERS.find((x) => x.username === n);
      if (!u) continue;
      // dnevna: najbolja današnja partija; trening: najbolja trening partija svih vremena (nizovi se razlikuju)
      const r = mode === "daily" ? mockDay(u, date) : mockRange(u, LAUNCH_DATE, date, "training");
      const played = mode === "daily" ? Boolean(r) : (r as ReturnType<typeof mockRange>).played > 0;
      if (r && played) out.push({ userId: u.id, username: u.username, avatar: u.avatar, words: r.words, score: r.score, simulated: true });
    }
    return out.sort((a, b) => a.words - b.words);
  }

  async getLeaderboard(mode: Mode, scope: LeaderboardScope, date: string): Promise<LeaderboardEntry[]> {
    const s = this.load();
    const me = s.profile;
    const rows: Array<Omit<LeaderboardEntry, "rank">> = [];
    const mine = s.games.filter((g) => g.mode === mode);
    const myBest = (from: string, to: string) => bestOf(mine.filter((g) => g.date >= from && g.date <= to));

    // Prijatelji: dnevna liga = današnji najbolji; trening liga = high score svih vremena (nema „današnjeg niza").
    const [from, to] = scope === "friends" ? (mode === "daily" ? rangeFor("daily", date) : rangeFor("all", date)) : rangeFor(scope, date);
    const pool = scope === "friends" ? MOCK_USERS.filter((u) => s.friends.includes(u.username)) : MOCK_USERS;
    for (const u of pool) {
      const r = mockRange(u, from, to, mode);
      if (r.played > 0) rows.push({ userId: u.id, username: u.username, avatar: u.avatar, points: r.score, words: r.words, isMe: false, simulated: true });
    }
    const best = myBest(from, to);
    if (me && best) rows.push({ userId: me.id, username: me.username, avatar: me.avatar, points: best.score, words: best.words, isMe: true });

    rows.sort((a, b) => b.points - a.points || b.words - a.words || a.username.localeCompare(b.username));
    let rank = 0;
    let last = "";
    return rows.map((r, i) => {
      const key = `${r.points}:${r.words}`;
      if (key !== last) rank = i + 1;
      last = key;
      return { ...r, rank };
    });
  }
}
