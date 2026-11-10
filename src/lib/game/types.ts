import type { Mode } from "./constants";

/** Jedan korak zapisa partije. w = upisana riječ (kako je igrač upisao), null = bomba je eksplodirala. t = ms. */
export interface LogEntry {
  w: string | null;
  t: number;
}

export interface WordEntry {
  /** Slog koji je bio na bombi. */
  syllable: string;
  /** Kanonski oblik riječi iz rječnika. */
  word: string;
  ms: number;
  points: number;
  combo: number;
}

export interface GameState {
  /** Indeks sljedećeg sloga u nizu (= broj dosad potrošenih slogova). */
  step: number;
  lives: number;
  score: number;
  /** Broj točnih riječi. */
  successes: number;
  booms: number;
  combo: number;
  maxCombo: number;
  /** Je li prethodni odgovor bio brz (daje +1 s sljedećem tajmeru). */
  lastFast: boolean;
  /** Kanonske riječi iskorištene u ovoj partiji. */
  used: string[];
  words: WordEntry[];
  longest: string;
  over: boolean;
}

export interface GameSummary {
  score: number;
  words: number;
  maxCombo: number;
  longest: string;
  wordList: string[];
  booms: number;
  /** Zbroj svih t u zapisu. */
  durationMs: number;
}

/** Spremljeni rezultat jedne dnevne partije. */
export interface GameResult extends GameSummary {
  mode: Mode;
  date: string; // YYYY-MM-DD (Europe/Zagreb)
  number: number;
  finishedAt: string;
}

export type WordRejection = "empty" | "no-syllable" | "not-in-dictionary" | "used" | "invalid";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface AvatarSpec {
  color: string;
}

export interface Profile {
  id: string;
  username: string;
  avatar: AvatarSpec;
  /** Supabase: anonimni račun koji još nije povezan s e-mailom. */
  anonymous?: boolean;
  email?: string | null;
}

export type LeaderboardScope = "friends" | "daily" | "weekly" | "all";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: AvatarSpec;
  points: number;
  words: number;
  isMe: boolean;
  simulated?: boolean;
}

/** Prijatelj koji je danas već odigrao: „duh" na traci napretka. */
export interface Ghost {
  userId: string;
  username: string;
  avatar: AvatarSpec;
  words: number;
  score: number;
  simulated?: boolean;
}

export interface FriendEntry {
  userId: string;
  username: string;
  avatar: AvatarSpec;
  todayWords: number | null;
  todayScore: number | null;
  totalScore: number;
  simulated?: boolean;
}
