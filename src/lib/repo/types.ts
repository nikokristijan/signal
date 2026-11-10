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

/**
 * Everything the UI needs from a backend. Two implementations exist:
 *  - LocalRepository    – browser storage + simulated community (demo / offline)
 *  - SupabaseRepository – Supabase Auth + Postgres (see supabase/migrations)
 *
 * Guess checking lives behind this interface on purpose: with Supabase the answer
 * never leaves the database until the attempt is finished.
 */
export interface GameRepository {
  readonly mode: "local" | "supabase";
  /** Present only when the backend needs real sign-in (Supabase). */
  readonly auth?: {
    signInWithEmail(email: string, username: string): Promise<Result<true>>;
    signOut(): Promise<void>;
  };

  /** Current profile, or null when nobody is signed in. */
  getProfile(): Promise<Profile | null>;
  /** Local mode creates a guest profile on first use. Supabase mode requires sign-in. */
  ensureProfile(): Promise<Profile | null>;
  updateProfile(patch: { username?: string; avatar?: AvatarSpec }): Promise<Result<Profile>>;

  getChallenge(dateKey: string): Promise<PublicChallenge>;
  getAttempt(challengeId: string): Promise<Attempt | null>;
  startAttempt(challenge: PublicChallenge): Promise<Attempt>;
  submitGuess(challengeId: string, guess: string): Promise<GuessOutcome>;
  revealNextStage(challengeId: string): Promise<Attempt>;
  giveUp(challengeId: string): Promise<Attempt>;
  /** Answer, category, facts and photo credit — only once the attempt is finished. */
  getReveal(challengeId: string): Promise<Reveal | null>;

  listAttempts(): Promise<Attempt[]>;
  listHistory(): Promise<HistoryEntry[]>;
  getStreak(dateKey: string): Promise<{ current: number; longest: number }>;

  listFriends(dateKey: string): Promise<FriendEntry[]>;
  addFriend(username: string, dateKey: string): Promise<Result<FriendEntry>>;
  removeFriend(userId: string): Promise<void>;

  getLeaderboard(scope: LeaderboardScope, dateKey: string): Promise<LeaderboardEntry[]>;
}
