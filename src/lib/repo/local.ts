import { getChallengeById, getChallengeForDate, toPublic, toReveal } from "../data/challenges";
import { applyGiveUp, applyGuess, applyReveal } from "../game/engine";
import { newAttempt } from "../game/scoring";
import { computeStreaks } from "../game/stats";
import type {
  Attempt,
  AvatarSpec,
  FriendEntry,
  GuessOutcome,
  HistoryEntry,
  LeaderboardEntry,
  LeaderboardScope,
  Profile,
  PublicChallenge,
  Result,
  Reveal,
} from "../game/types";
import { AVATAR_KEYS } from "../avatars";
import { DEFAULT_FRIENDS, MOCK_USERS, mockPoints, mockTotal, rangeFor } from "./mock-community";
import { LAUNCH_DATE } from "../data/challenges";
import type { GameRepository } from "./types";

const STORAGE_KEY = "signal:v1";

interface StoredState {
  profile: Profile | null;
  attempts: Record<string, Attempt>;
  /** usernames of simulated friends */
  friends: string[];
}

export const USERNAME_RE = /^[a-z0-9_]{3,16}$/;

/** localStorage can throw (private mode, blocked storage): fall back to memory. */
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
    write(value: string) {
      memory = value;
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* keep in memory only */
      }
    },
  };
}

function guestName(): string {
  return `player${Math.floor(1000 + Math.random() * 9000)}`;
}

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class LocalRepository implements GameRepository {
  readonly mode = "local" as const;
  private storage = createStorage();

  private load(): StoredState {
    const raw = this.storage.read();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoredState;
        return { profile: parsed.profile ?? null, attempts: parsed.attempts ?? {}, friends: parsed.friends ?? DEFAULT_FRIENDS };
      } catch {
        /* corrupted: start over */
      }
    }
    return { profile: null, attempts: {}, friends: [...DEFAULT_FRIENDS] };
  }

  private save(state: StoredState) {
    this.storage.write(JSON.stringify(state));
  }

  async getProfile() {
    return this.load().profile;
  }

  async ensureProfile(): Promise<Profile> {
    const state = this.load();
    if (state.profile) return state.profile;
    const taken = new Set(MOCK_USERS.map((u) => u.username));
    let username = guestName();
    while (taken.has(username)) username = guestName();
    const profile: Profile = { id: uuid(), username, avatar: { color: AVATAR_KEYS[Math.floor(Math.random() * AVATAR_KEYS.length)] } };
    this.save({ ...state, profile });
    return profile;
  }

  async updateProfile(patch: { username?: string; avatar?: AvatarSpec }): Promise<Result<Profile>> {
    const state = this.load();
    if (!state.profile) return { ok: false, error: "Još nemaš profil." };
    let username = state.profile.username;
    if (patch.username !== undefined) {
      username = patch.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) return { ok: false, error: "Koristi 3–16 slova, brojki ili podvlaka." };
      if (MOCK_USERS.some((u) => u.username === username)) return { ok: false, error: "To korisničko ime je zauzeto." };
    }
    const profile = { ...state.profile, username, avatar: patch.avatar ?? state.profile.avatar };
    this.save({ ...state, profile });
    return { ok: true, value: profile };
  }

  async getChallenge(dateKey: string): Promise<PublicChallenge> {
    return toPublic(getChallengeForDate(dateKey));
  }

  async getAttempt(challengeId: string) {
    return this.load().attempts[challengeId] ?? null;
  }

  async startAttempt(challenge: PublicChallenge): Promise<Attempt> {
    const state = this.load();
    const existing = state.attempts[challenge.id];
    if (existing) return existing;
    const attempt = newAttempt(challenge);
    this.save({ ...state, attempts: { ...state.attempts, [challenge.id]: attempt } });
    return attempt;
  }

  private mutate(challengeId: string, fn: (a: Attempt) => Attempt): Attempt {
    const state = this.load();
    const current = state.attempts[challengeId];
    if (!current) throw new Error("Attempt not started");
    const next = fn(current);
    this.save({ ...state, attempts: { ...state.attempts, [challengeId]: next } });
    return next;
  }

  async submitGuess(challengeId: string, guess: string): Promise<GuessOutcome> {
    const challenge = getChallengeById(challengeId);
    if (!challenge) throw new Error("Unknown challenge");
    const state = this.load();
    const current = state.attempts[challengeId];
    if (!current) throw new Error("Attempt not started");
    const outcome = applyGuess(current, challenge, guess);
    if (outcome.attempt !== current) {
      this.save({ ...state, attempts: { ...state.attempts, [challengeId]: outcome.attempt } });
    }
    return outcome;
  }

  async revealNextStage(challengeId: string) {
    return this.mutate(challengeId, applyReveal);
  }

  async giveUp(challengeId: string) {
    return this.mutate(challengeId, (a) => applyGiveUp(a));
  }

  async getReveal(challengeId: string): Promise<Reveal | null> {
    const attempt = this.load().attempts[challengeId];
    if (!attempt || attempt.status === "playing") return null;
    const challenge = getChallengeById(challengeId);
    return challenge ? toReveal(challenge) : null;
  }

  async listAttempts() {
    return Object.values(this.load().attempts).sort((a, b) => a.date.localeCompare(b.date));
  }

  async listHistory(): Promise<HistoryEntry[]> {
    const out: HistoryEntry[] = [];
    for (const a of await this.listAttempts()) {
      if (a.status === "playing") continue;
      const c = getChallengeById(a.challengeId);
      if (c) out.push({ ...a, subject: c.subject, category: c.category, image: c.stages[4] });
    }
    return out.reverse();
  }

  async getStreak(dateKey: string) {
    return computeStreaks(await this.listAttempts(), dateKey);
  }

  private myPoints(attempts: Attempt[], from: string, to: string): number {
    return attempts.filter((a) => a.status !== "playing" && a.date >= from && a.date <= to).reduce((s, a) => s + a.score, 0);
  }

  async listFriends(dateKey: string): Promise<FriendEntry[]> {
    const { friends } = this.load();
    return friends
      .map((name) => MOCK_USERS.find((u) => u.username === name))
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => ({
        userId: u.id,
        username: u.username,
        avatar: u.avatar,
        todayPoints: mockPoints(u, dateKey),
        totalPoints: mockTotal(u, LAUNCH_DATE, dateKey),
      }));
  }

  async addFriend(username: string, dateKey: string): Promise<Result<FriendEntry>> {
    const name = username.trim().replace(/^@/, "").toLowerCase();
    const state = this.load();
    if (!name) return { ok: false, error: "Upiši korisničko ime." };
    if (state.profile?.username === name) return { ok: false, error: "To si ti!" };
    const user = MOCK_USERS.find((u) => u.username === name);
    if (!user) return { ok: false, error: `Ne postoji igrač „${name}”.` };
    if (state.friends.includes(name)) return { ok: false, error: `${name} ti je već prijatelj.` };
    this.save({ ...state, friends: [...state.friends, name] });
    return {
      ok: true,
      value: {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        todayPoints: mockPoints(user, dateKey),
        totalPoints: mockTotal(user, LAUNCH_DATE, dateKey),
      },
    };
  }

  async removeFriend(userId: string) {
    const state = this.load();
    const name = userId.replace(/^mock-/, "");
    this.save({ ...state, friends: state.friends.filter((f) => f !== name) });
  }

  async getLeaderboard(scope: LeaderboardScope, dateKey: string): Promise<LeaderboardEntry[]> {
    const state = this.load();
    const attempts = Object.values(state.attempts);
    const me = state.profile;
    const rows: Array<Omit<LeaderboardEntry, "rank"> & { played: boolean }> = [];

    if (scope === "friends") {
      const friends = state.friends.map((n) => MOCK_USERS.find((u) => u.username === n)).filter((u): u is NonNullable<typeof u> => !!u);
      for (const u of friends) {
        const total = mockTotal(u, LAUNCH_DATE, dateKey);
        rows.push({ userId: u.id, username: u.username, avatar: u.avatar, points: total, total, today: mockPoints(u, dateKey), isMe: false, played: true });
      }
      if (me) {
        const total = this.myPoints(attempts, LAUNCH_DATE, dateKey);
        const todayAttempt = attempts.find((a) => a.date === dateKey && a.status !== "playing");
        rows.push({ userId: me.id, username: me.username, avatar: me.avatar, points: total, total, today: todayAttempt ? todayAttempt.score : null, isMe: true, played: true });
      }
    } else {
      const [from, to] = rangeFor(scope, dateKey);
      for (const u of MOCK_USERS) {
        const points = mockTotal(u, from, to);
        const played = scope === "daily" ? mockPoints(u, dateKey) !== null : points > 0;
        rows.push({ userId: u.id, username: u.username, avatar: u.avatar, points, isMe: false, played });
      }
      if (me) {
        const mine = attempts.filter((a) => a.status !== "playing" && a.date >= from && a.date <= to);
        rows.push({ userId: me.id, username: me.username, avatar: me.avatar, points: mine.reduce((s, a) => s + a.score, 0), isMe: true, played: mine.length > 0 });
      }
    }

    const ranked = rows.filter((r) => r.played).sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));
    let lastPoints = -1;
    let lastRank = 0;
    return ranked.map((r, i) => {
      const rank = r.points === lastPoints ? lastRank : i + 1;
      lastPoints = r.points;
      lastRank = rank;
      const { played: _played, ...entry } = r;
      return { ...entry, rank };
    });
  }
}
