import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Attempt,
  AvatarSpec,
  FriendEntry,
  Guess,
  GuessOutcome,
  HistoryEntry,
  LeaderboardEntry,
  LeaderboardScope,
  Profile,
  PublicChallenge,
  Result,
  Reveal,
  Verdict,
} from "../game/types";
import type { GameRepository } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const USERNAME_RE = /^[a-z0-9_]{3,16}$/;

/** Maps a daily_attempts row (snake_case, from the database) to the Attempt the UI uses. */
function toAttempt(row: any, number: number, date: string): Attempt {
  return {
    challengeId: row.challenge_id,
    date,
    number,
    stage: row.stage,
    guesses: (row.guesses ?? []) as Guess[],
    wrongCount: row.wrong_count,
    status: row.status,
    score: row.score,
    solvedStage: row.solved_stage ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
  };
}

/**
 * Supabase-backed repository. Business rules (answer checking, scoring, streaks,
 * leaderboards) live in Postgres functions — see supabase/migrations/0001_init.sql.
 * This class only translates between those functions and the UI's types.
 */
export class SupabaseRepository implements GameRepository {
  readonly mode = "supabase" as const;
  private client: SupabaseClient;
  /** Remember number/date per challenge id: daily_attempts rows don't carry them. */
  private meta = new Map<string, { number: number; date: string }>();

  constructor(url: string, anonKey: string) {
    this.client = createBrowserClient(url, anonKey);
  }

  readonly auth = {
    signInWithEmail: async (email: string, username: string): Promise<Result<true>> => {
      if (username && !USERNAME_RE.test(username)) return { ok: false, error: "Username must be 3–16 letters, numbers or underscores." };
      const { error } = await this.client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin, data: username ? { username } : undefined },
      });
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

  async getProfile(): Promise<Profile | null> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await this.client.from("profiles").select("id, username, avatar_color").eq("id", auth.user.id).maybeSingle();
    if (error || !data) return null;
    return { id: data.id, username: data.username, avatar: { color: data.avatar_color } };
  }

  ensureProfile() {
    return this.getProfile();
  }

  async updateProfile(patch: { username?: string; avatar?: AvatarSpec }): Promise<Result<Profile>> {
    const me = await this.getProfile();
    if (!me) return { ok: false, error: "Sign in first." };
    const update: Record<string, string> = {};
    if (patch.username !== undefined) {
      const u = patch.username.trim().toLowerCase();
      if (!USERNAME_RE.test(u)) return { ok: false, error: "Use 3–16 letters, numbers or underscores." };
      update.username = u;
    }
    if (patch.avatar) update.avatar_color = patch.avatar.color;
    const { error } = await this.client.from("profiles").update(update).eq("id", me.id);
    if (error) return { ok: false, error: error.code === "23505" ? "That username is taken." : error.message };
    return { ok: true, value: (await this.getProfile())! };
  }

  async getChallenge(dateKey: string): Promise<PublicChallenge> {
    const rows = await this.rpc<any[]>("get_challenge", { p_date: dateKey });
    const row = rows?.[0];
    if (!row) throw new Error("No challenge published for this date.");
    this.meta.set(row.id, { number: row.number, date: row.publish_date });
    return { id: row.id, number: row.number, date: row.publish_date, stages: row.stage_images };
  }

  private attemptFrom(row: any): Attempt {
    const m = this.meta.get(row.challenge_id) ?? { number: 0, date: "" };
    return toAttempt(row, m.number, m.date);
  }

  async getAttempt(challengeId: string): Promise<Attempt | null> {
    const { data, error } = await this.client.from("daily_attempts").select("*").eq("challenge_id", challengeId).maybeSingle();
    if (error || !data) return null;
    return this.attemptFrom(data);
  }

  async startAttempt(challenge: PublicChallenge): Promise<Attempt> {
    this.meta.set(challenge.id, { number: challenge.number, date: challenge.date });
    return this.attemptFrom(await this.rpc("start_attempt", { p_challenge: challenge.id }));
  }

  async submitGuess(challengeId: string, guess: string): Promise<GuessOutcome> {
    const res = await this.rpc<{ verdict: Verdict; penalty: number; attempt: any }>("submit_guess", { p_challenge: challengeId, p_guess: guess });
    return { verdict: res.verdict, penalty: res.penalty, attempt: this.attemptFrom(res.attempt) };
  }

  async revealNextStage(challengeId: string) {
    return this.attemptFrom(await this.rpc("reveal_stage", { p_challenge: challengeId }));
  }

  async giveUp(challengeId: string) {
    return this.attemptFrom(await this.rpc("give_up", { p_challenge: challengeId }));
  }

  async getReveal(challengeId: string): Promise<Reveal | null> {
    const r = await this.rpc<any>("get_reveal", { p_challenge: challengeId });
    return r ?? null;
  }

  async listAttempts(): Promise<Attempt[]> {
    const { data, error } = await this.client.from("daily_attempts").select("*, challenges:challenge_id(number, publish_date)");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => toAttempt(row, row.challenges?.number ?? 0, row.challenges?.publish_date ?? ""));
  }

  async listHistory(): Promise<HistoryEntry[]> {
    const rows = await this.rpc<any[]>("get_history");
    return (rows ?? []).map((r) => ({
      ...toAttempt(r, r.number, r.publish_date),
      subject: r.subject,
      category: r.category,
      image: r.image,
    }));
  }

  async getStreak(dateKey: string) {
    const rows = await this.rpc<any[]>("get_streak", { p_today: dateKey });
    const r = rows?.[0];
    return { current: r?.current_streak ?? 0, longest: r?.longest_streak ?? 0 };
  }

  async listFriends(dateKey: string): Promise<FriendEntry[]> {
    const rows = await this.rpc<any[]>("list_friends", { p_today: dateKey });
    return (rows ?? []).map((r) => ({
      userId: r.user_id,
      username: r.username,
      avatar: { color: r.avatar_color },
      todayPoints: r.today_points ?? null,
      totalPoints: Number(r.total_points),
    }));
  }

  async addFriend(username: string, dateKey: string): Promise<Result<FriendEntry>> {
    try {
      const rows = await this.rpc<any[]>("add_friend", { p_username: username.replace(/^@/, "") });
      const r = rows[0];
      const friends = await this.listFriends(dateKey);
      return {
        ok: true,
        value: friends.find((f) => f.userId === r.user_id) ?? { userId: r.user_id, username: r.username, avatar: { color: r.avatar_color }, todayPoints: null, totalPoints: 0 },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not add friend." };
    }
  }

  async removeFriend(userId: string) {
    await this.rpc("remove_friend", { p_friend: userId });
  }

  async getLeaderboard(scope: LeaderboardScope, dateKey: string): Promise<LeaderboardEntry[]> {
    const [rows, me] = await Promise.all([this.rpc<any[]>("leaderboard", { p_scope: scope, p_today: dateKey }), this.getProfile()]);
    return (rows ?? []).map((r) => ({
      rank: Number(r.rank),
      userId: r.user_id,
      username: r.username,
      avatar: { color: r.avatar_color },
      points: Number(r.points),
      isMe: r.user_id === me?.id,
      ...(scope === "friends" ? { today: r.today_points ?? null, total: Number(r.points) } : {}),
    }));
  }
}
