import type { Mode } from "../game/constants";
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

/** Stanje jedne lige (dnevne ili trening) za igrača. */
export interface LeagueStatus {
  mode: Mode;
  date: string;
  number: number;
  /** Postoji nezavršena partija (može se nastaviti). */
  playing: boolean;
  /** Kad je počela nezavršena partija (ms, serverski sat). */
  startedAt?: number;
  /** ID nezavršene partije (kod treninga iz njega proizlazi niz slogova). */
  gameId?: string;
  /** Najbolja završena partija DANAS u toj ligi, ili null. */
  best: GameResult | null;
  gamesToday: number;
}

export interface StartedGame {
  startedAt: number;
  resumed: boolean;
  /** Dodjeljuje server. Dnevna liga: samo identifikator; trening liga: iz njega se izvodi niz slogova. */
  gameId: string;
}

/**
 * Sve što sučelje traži od pozadine. Dvije implementacije:
 *  - LocalRepository    – localStorage + simulirani prijatelji (demo bez Supabasea)
 *  - SupabaseRepository – Supabase Auth + Postgres + API rute koje ponovno odigravaju partiju
 *
 * DVIJE LIGE, obje bez ograničenja broja partija i obje s ljestvicom po NAJBOLJEM rezultatu (high score):
 *  - dnevna liga: isti niz slogova za sve taj dan, utječe na niz dana;
 *  - trening liga: svaka partija ima svoj niz slogova (seed dodjeljuje server), ne utječe na niz dana.
 * Klijent NIKAD ne šalje bodove: samo zapis partije (`finishGame`).
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

  getStatus(mode: Mode, date: string): Promise<LeagueStatus>;
  /**
   * Započinje novu partiju u ligi. `resume: true` nastavlja nezavršenu partiju ako postoji;
   * inače se nezavršena partija odbacuje i počinje nova.
   */
  startGame(mode: Mode, date: string, resume: boolean): Promise<Result<StartedGame>>;
  finishGame(mode: Mode, date: string, gameId: string, log: LogEntry[]): Promise<Result<FinishInfo>>;
  /** Sve završene partije svih liga, najnovije prvo. */
  listResults(): Promise<GameResult[]>;

  listFriends(date: string): Promise<FriendEntry[]>;
  addFriend(username: string, date: string): Promise<Result<FriendEntry>>;
  removeFriend(userId: string): Promise<void>;
  /**
   * „Duhovi" na traci napretka: prijatelji koje možeš prestići.
   * Dnevna: najbolja današnja partija svakog prijatelja. Trening: njihova najbolja trening partija svih vremena.
   */
  getGhosts(mode: Mode, date: string): Promise<Ghost[]>;

  getLeaderboard(mode: Mode, scope: LeaderboardScope, date: string): Promise<LeaderboardEntry[]>;
}
