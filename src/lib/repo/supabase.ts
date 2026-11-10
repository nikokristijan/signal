import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowser } from "../supabase/browser";
import { challengeNumber } from "../game/dates";
import type { AvatarSpec, FriendEntry, GameResult, Ghost, LeaderboardEntry, LeaderboardScope, LogEntry, Profile, Result } from "../game/types";
import type { BombRepository, DailyStatus } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const USERNAME_RE = /^[a-z0-9_]{3,16}$/;

/**
 * Supabase pozadina. Pravila igre (provjera slogova, rječnika, bodovanje) NE žive ovdje nego na serveru:
 * /api/igra/kraj ponovno odigra zapis. Ova klasa samo prevodi između API-ja/RPC-a i tipova sučelja.
 */
export class SupabaseRepository implements BombRepository {
  readonly mode = "supabase" as const;
  private client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createBrowser(url, anonKey);
  }

  readonly auth = {
    linkEmail: async (email: string): Promise<Result<true>> => {
      const { error } = await this.client.auth.updateUser({ email }, { emailRedirectTo: window.location.origin });
      return error ? { ok: false, error: error.message } : { ok: true, value: true };
    },
    signInWithEmail: async (email: string): Promise<Result<true>> => {
      const { error } = await this.client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } });
      return error ? { ok: false, error: error.message } : { ok: true, value: true };
    },
    signOut: async () => {
      await this.client.auth.signOut();
    },
  };

  private async rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  private async api<T = any>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T }> {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, credentials: "same-origin" });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* prazno tijelo */
    }
    return { ok: res.ok, status: res.status, body };
  }

  /** Bez trenja: anonimna prijava, korisničko ime se bira kasnije (profil nastaje okidačem u bazi). */
  async ensureProfile(): Promise<Profile | null> {
    let { data } = await this.client.auth.getUser();
    if (!data.user) {
      const res = await this.client.auth.signInAnonymously();
      if (res.error || !res.data.user) return null;
      data = { user: res.data.user };
    }
    const user = data.user!;
    const { data: row } = await this.client.from("profiles").select("id, username, avatar_color").eq("id", user.id).maybeSingle();
    if (!row) return null;
    return { id: row.id, username: row.username, avatar: { color: row.avatar_color }, anonymous: Boolean(user.is_anonymous), email: user.email ?? null };
  }

  async updateProfile(patch: { username?: string; avatar?: AvatarSpec }): Promise<Result<Profile>> {
    const me = await this.ensureProfile();
    if (!me) return { ok: false, error: "Nisi prijavljen." };
    const update: Record<string, string> = {};
    if (patch.username !== undefined) {
      const u = patch.username.trim().toLowerCase();
      if (!USERNAME_RE.test(u)) return { ok: false, error: "3–16 znakova: mala slova, brojevi ili _." };
      update.username = u;
    }
    if (patch.avatar) update.avatar_color = patch.avatar.color;
    const { error } = await this.client.from("profiles").update(update).eq("id", me.id);
    if (error) return { ok: false, error: error.code === "23505" ? "To korisničko ime je zauzeto." : error.message };
    return { ok: true, value: (await this.ensureProfile())! };
  }

  async getDaily(date: string): Promise<DailyStatus> {
    const r = await this.api<DailyStatus>(`/api/igra/stanje?date=${encodeURIComponent(date)}`);
    if (!r.ok) return { date, number: challengeNumber(date), state: "new" };
    return r.body;
  }

  async startDaily(_date: string) {
    const r = await this.api<{ startedAt: number; state: DailyStatus["state"]; result?: GameResult; error?: string }>("/api/igra/start", { method: "POST" });
    if (!r.ok) return { ok: false as const, error: r.body?.error ?? "Partija se nije mogla započeti." };
    return { ok: true as const, value: r.body };
  }

  async finishDaily(date: string, log: LogEntry[]): Promise<Result<GameResult>> {
    const r = await this.api<{ result?: GameResult; error?: string }>("/api/igra/kraj", { method: "POST", body: JSON.stringify({ date, log }) });
    if (!r.ok || !r.body?.result) return { ok: false, error: r.body?.error ?? "Rezultat se nije mogao spremiti." };
    return { ok: true, value: r.body.result };
  }

  async listResults(): Promise<GameResult[]> {
    const { data, error } = await this.client
      .from("games")
      .select("challenge_date, challenge_number, score, words, max_combo, longest, word_list, booms, duration_ms, finished_at")
      .eq("status", "finished")
      .order("challenge_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((g: any) => ({
      mode: "daily" as const,
      date: g.challenge_date,
      number: g.challenge_number,
      score: g.score,
      words: g.words,
      maxCombo: g.max_combo,
      longest: g.longest ?? "",
      wordList: g.word_list ?? [],
      booms: g.booms ?? 0,
      durationMs: g.duration_ms ?? 0,
      finishedAt: g.finished_at,
    }));
  }

  async listFriends(date: string): Promise<FriendEntry[]> {
    const rows = await this.rpc<any[]>("list_friends", { p_date: date });
    return (rows ?? []).map((r) => ({
      userId: r.user_id,
      username: r.username,
      avatar: { color: r.avatar_color },
      todayWords: r.today_words ?? null,
      todayScore: r.today_points ?? null,
      totalScore: Number(r.total_points),
    }));
  }

  async addFriend(username: string, date: string): Promise<Result<FriendEntry>> {
    try {
      const rows = await this.rpc<any[]>("add_friend", { p_username: username.replace(/^@/, "") });
      const friends = await this.listFriends(date);
      const f = friends.find((x) => x.userId === rows[0].user_id);
      return { ok: true, value: f ?? { userId: rows[0].user_id, username: rows[0].username, avatar: { color: rows[0].avatar_color }, todayWords: null, todayScore: null, totalScore: 0 } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Prijatelj se nije mogao dodati." };
    }
  }

  async removeFriend(userId: string) {
    await this.rpc("remove_friend", { p_friend: userId });
  }

  async getGhosts(date: string): Promise<Ghost[]> {
    const rows = await this.rpc<any[]>("friends_today", { p_date: date });
    return (rows ?? []).map((r) => ({ userId: r.user_id, username: r.username, avatar: { color: r.avatar_color }, words: r.words, score: r.points }));
  }

  async getLeaderboard(scope: LeaderboardScope, date: string): Promise<LeaderboardEntry[]> {
    const [rows, me] = await Promise.all([this.rpc<any[]>("leaderboard", { p_scope: scope, p_date: date }), this.client.auth.getUser()]);
    return (rows ?? []).map((r) => ({
      rank: Number(r.rank),
      userId: r.user_id,
      username: r.username,
      avatar: { color: r.avatar_color },
      points: Number(r.points),
      words: Number(r.words),
      isMe: r.user_id === me.data.user?.id,
    }));
  }
}
