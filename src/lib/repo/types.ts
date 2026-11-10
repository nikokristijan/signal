import type {
  AvatarSpec,
  FriendEntry,
  GameResult,
  Ghost,
  LeaderboardEntry,
  LeaderboardScope,
  LogEntry,
  Profile,
  Result,
} from "../game/types";

export interface DailyStatus {
  date: string;
  number: number;
  state: "new" | "playing" | "finished";
  result?: GameResult;
  /** Kad je ranglirana partija počela (ms, serverski sat). */
  startedAt?: number;
}

/**
 * Sve što sučelje traži od pozadine. Dvije implementacije:
 *  - LocalRepository    – localStorage + simulirani prijatelji (demo bez Supabasea)
 *  - SupabaseRepository – Supabase Auth + Postgres + API rute koje ponovno odigravaju partiju
 *
 * Klijent NIKAD ne šalje bodove: samo zapis partije (`finishDaily`). Bodove računa „server".
 */
export interface BombRepository {
  readonly mode: "local" | "supabase";
  readonly auth?: {
    /** Anonimni račun povezuje s e-mailom da se ne izgubi. */
    linkEmail(email: string): Promise<Result<true>>;
    /** Prijava postojećeg (povezanog) računa na novom uređaju. */
    signInWithEmail(email: string): Promise<Result<true>>;
    signOut(): Promise<void>;
  };

  ensureProfile(): Promise<Profile | null>;
  updateProfile(patch: { username?: string; avatar?: AvatarSpec }): Promise<Result<Profile>>;

  getDaily(date: string): Promise<DailyStatus>;
  startDaily(date: string): Promise<Result<{ startedAt: number; state: DailyStatus["state"]; result?: GameResult }>>;
  finishDaily(date: string, log: LogEntry[]): Promise<Result<GameResult>>;
  listResults(): Promise<GameResult[]>;

  listFriends(date: string): Promise<FriendEntry[]>;
  addFriend(username: string, date: string): Promise<Result<FriendEntry>>;
  removeFriend(userId: string): Promise<void>;
  /** Prijatelji koji su danas već odigrali: „duhovi" na traci napretka. */
  getGhosts(date: string): Promise<Ghost[]>;

  getLeaderboard(scope: LeaderboardScope, date: string): Promise<LeaderboardEntry[]>;
}
