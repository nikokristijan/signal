import type {
  AvatarSpec,
  FinishInfo,
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
  /** Postoji nezavršena partija (može se nastaviti). */
  playing: boolean;
  /** Kad je počela nezavršena partija (ms, serverski sat). */
  startedAt?: number;
  /** Najbolja završena partija danas, ili null ako danas još nije odigrana nijedna. */
  best: GameResult | null;
  gamesToday: number;
}

/**
 * Sve što sučelje traži od pozadine. Dvije implementacije:
 *  - LocalRepository    – localStorage + simulirani prijatelji (demo bez Supabasea)
 *  - SupabaseRepository – Supabase Auth + Postgres + API rute koje ponovno odigravaju partiju
 *
 * Partija se može igrati koliko god puta; svi dnevni pokušaji koriste isti niz slogova, a na ljestvicama se
 * gleda NAJBOLJI rezultat (high score). Klijent NIKAD ne šalje bodove: samo zapis partije (`finishDaily`).
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
  /**
   * Započinje novu partiju. `resume: true` nastavlja nezavršenu partiju ako postoji;
   * inače se nezavršena partija odbacuje i počinje nova.
   */
  startDaily(date: string, resume: boolean): Promise<Result<{ startedAt: number; resumed: boolean }>>;
  finishDaily(date: string, log: LogEntry[]): Promise<Result<FinishInfo>>;
  /** Sve završene partije, najnovije prvo. */
  listResults(): Promise<GameResult[]>;

  listFriends(date: string): Promise<FriendEntry[]>;
  addFriend(username: string, date: string): Promise<Result<FriendEntry>>;
  removeFriend(userId: string): Promise<void>;
  /** Prijatelji koji su danas već odigrali: „duhovi" na traci napretka (njihova najbolja današnja partija). */
  getGhosts(date: string): Promise<Ghost[]>;

  getLeaderboard(scope: LeaderboardScope, date: string): Promise<LeaderboardEntry[]>;
}
