import { AVATAR_KEYS } from "../avatars";
import { loadDictionary } from "../dict/loader";
import { challengeNumber, dailySeed, LAUNCH_DATE } from "../game/dates";
import { checkElapsed, replayLog } from "../game/replay";
import type { AvatarSpec, FriendEntry, GameResult, Ghost, LeaderboardEntry, LeaderboardScope, LogEntry, Profile, Result } from "../game/types";
import { DEFAULT_FRIENDS, MOCK_USERS, mockDay, mockRange, rangeFor } from "./mock-community";
import type { BombRepository, DailyStatus } from "./types";

const STORAGE_KEY = "bomba:v1";
export const USERNAME_RE = /^[a-z0-9_]{3,16}$/;

interface Stored {
  profile: Profile | null;
  results: Record<string, GameResult>;
  /** Kad je počela ranglirana partija za dan (ms). Samo jedan pokušaj dnevno. */
  started: Record<string, number>;
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

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class LocalRepository implements BombRepository {
  readonly mode = "local" as const;
  private storage = createStorage();

  private load(): Stored {
    const raw = this.storage.read();
    if (raw) {
      try {
        const p = JSON.parse(raw) as Stored;
        return { profile: p.profile ?? null, results: p.results ?? {}, started: p.started ?? {}, friends: p.friends ?? [...DEFAULT_FRIENDS] };
      } catch {
        /* oštećeno: kreni ispočetka */
      }
    }
    return { profile: null, results: {}, started: {}, friends: [...DEFAULT_FRIENDS] };
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

  async getDaily(date: string): Promise<DailyStatus> {
    const s = this.load();
    const number = challengeNumber(date);
    if (s.results[date]) return { date, number, state: "finished", result: s.results[date], startedAt: s.started[date] };
    if (s.started[date]) return { date, number, state: "playing", startedAt: s.started[date] };
    return { date, number, state: "new" };
  }

  async startDaily(date: string) {
    const s = this.load();
    if (s.results[date]) return { ok: true as const, value: { startedAt: s.started[date] ?? 0, state: "finished" as const, result: s.results[date] } };
    const startedAt = s.started[date] ?? Date.now();
    if (!s.started[date]) this.save({ ...s, started: { ...s.started, [date]: startedAt } });
    return { ok: true as const, value: { startedAt, state: "playing" as const } };
  }

  /** Ovdje lokalni „server": isti replay i iste provjere kao API ruta u Supabase načinu. */
  async finishDaily(date: string, log: LogEntry[]): Promise<Result<GameResult>> {
    const s = this.load();
    if (s.results[date]) return { ok: true, value: s.results[date] };
    const startedAt = s.started[date];
    if (!startedAt) return { ok: false, error: "Partija nije započeta." };
    const dict = await loadDictionary();
    const rep = replayLog(dailySeed(date), log, dict);
    if (!rep.ok) return rep;
    const elapsed = checkElapsed(rep.value.summary.durationMs, startedAt, Date.now());
    if (!elapsed.ok) return elapsed;
    const result: GameResult = { ...rep.value.summary, mode: "daily", date, number: challengeNumber(date), finishedAt: new Date().toISOString() };
    this.save({ ...s, results: { ...s.results, [date]: result } });
    return { ok: true, value: result };
  }

  async listResults() {
    return Object.values(this.load().results).sort((a, b) => b.date.localeCompare(a.date));
  }

  private friendEntry(u: (typeof MOCK_USERS)[number], date: string): FriendEntry {
    const today = mockDay(u, date);
    return {
      userId: u.id,
      username: u.username,
      avatar: u.avatar,
      todayWords: today?.words ?? null,
      todayScore: today?.score ?? null,
      totalScore: mockRange(u, LAUNCH_DATE, date).score,
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
    if (!u) return { ok: false, error: `Nema igrača „${name}".` };
    if (s.friends.includes(name)) return { ok: false, error: `${name} ti je već prijatelj.` };
    this.save({ ...s, friends: [...s.friends, name] });
    return { ok: true, value: this.friendEntry(u, date) };
  }

  async removeFriend(userId: string) {
    const s = this.load();
    const name = userId.replace(/^mock-/, "");
    this.save({ ...s, friends: s.friends.filter((f) => f !== name) });
  }

  async getGhosts(date: string): Promise<Ghost[]> {
    const out: Ghost[] = [];
    for (const f of await this.listFriends(date)) {
      if (f.todayWords !== null && f.todayScore !== null) {
        out.push({ userId: f.userId, username: f.username, avatar: f.avatar, words: f.todayWords, score: f.todayScore, simulated: true });
      }
    }
    return out.sort((a, b) => a.words - b.words);
  }

  async getLeaderboard(scope: LeaderboardScope, date: string): Promise<LeaderboardEntry[]> {
    const s = this.load();
    const me = s.profile;
    const rows: Array<Omit<LeaderboardEntry, "rank">> = [];
    const results = Object.values(s.results);

    if (scope === "friends") {
      for (const n of s.friends) {
        const u = MOCK_USERS.find((x) => x.username === n);
        const d = u && mockDay(u, date);
        if (u && d) rows.push({ userId: u.id, username: u.username, avatar: u.avatar, points: d.score, words: d.words, isMe: false, simulated: true });
      }
      const mine = s.results[date];
      if (me && mine) rows.push({ userId: me.id, username: me.username, avatar: me.avatar, points: mine.score, words: mine.words, isMe: true });
    } else {
      const [from, to] = rangeFor(scope, date);
      for (const u of MOCK_USERS) {
        const r = mockRange(u, from, to);
        if (r.played > 0) rows.push({ userId: u.id, username: u.username, avatar: u.avatar, points: r.score, words: r.words, isMe: false, simulated: true });
      }
      const mine = results.filter((r) => r.date >= from && r.date <= to);
      if (me && mine.length) {
        rows.push({
          userId: me.id,
          username: me.username,
          avatar: me.avatar,
          points: mine.reduce((a, r) => a + r.score, 0),
          words: mine.reduce((a, r) => a + r.words, 0),
          isMe: true,
        });
      }
    }

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
