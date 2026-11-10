export type Difficulty = "easy" | "medium" | "hard";

export type Category =
  | "Landmark"
  | "Famous building"
  | "Animal"
  | "Food"
  | "Car"
  | "Everyday item"
  | "Technology"
  | "Historical object"
  | "Nature"
  | "Object";

export interface PhotoCredit {
  /** Commons file title, e.g. "File:Eiffel Tower.jpg" */
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** Page the photo came from. */
  page: string;
}

/** Shape of one entry in src/lib/data/challenges.json */
export interface ChallengeDef {
  slug: string;
  subject: string;
  answer: string;
  alternatives: string[];
  /** Guesses that are on the right track but too generic: no penalty, just a nudge. */
  nudges: string[];
  category: Category;
  difficulty: Difficulty;
  fact: string;
  /** Focal point (0..1) every zoom stage is centred on. */
  focus: { x: number; y: number };
  /** Optional per-challenge zoom factors for stages 1..5 (stage 5 is always 1). */
  zooms?: number[];
  /** Original file on Commons, used only by the art build script. */
  source: { url: string; width: number; height: number };
  credit: PhotoCredit;
}

/** Full challenge, including the answer. Server-side (or local adapter) only. */
export interface Challenge {
  id: string;
  number: number;
  date: string; // YYYY-MM-DD
  slug: string;
  subject: string;
  answer: string;
  alternatives: string[];
  nudges: string[];
  category: Category;
  difficulty: Difficulty;
  fact: string;
  /** Five image URLs: crops of the SAME photograph, from extreme close-up to full frame. */
  stages: string[];
  credit: PhotoCredit;
}

/** What the player may see before finishing: no answer. */
export interface PublicChallenge {
  id: string;
  number: number;
  date: string;
  stages: string[];
}

/** What is revealed once the attempt is finished. */
export interface Reveal {
  subject: string;
  answer: string;
  category: Category;
  difficulty: Difficulty;
  fact: string;
  credit: PhotoCredit;
}

export type AttemptStatus = "playing" | "solved" | "gave_up";

export interface Guess {
  text: string;
  stage: number;
  correct: boolean;
}

export interface Attempt {
  challengeId: string;
  date: string;
  number: number;
  /** Highest stage revealed so far, 1..5 */
  stage: number;
  guesses: Guess[];
  wrongCount: number;
  status: AttemptStatus;
  /** Final score once finished; live score while playing. */
  score: number;
  /** Stage on which the answer was found, null if not solved. */
  solvedStage: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export type Verdict = "correct" | "close" | "wrong" | "duplicate" | "empty";

export interface GuessOutcome {
  verdict: Verdict;
  attempt: Attempt;
  /** Points lost on this guess (0 or 50) */
  penalty: number;
}

export interface AvatarSpec {
  color: string; // key of AVATAR_COLORS
}

export interface Profile {
  id: string;
  username: string;
  avatar: AvatarSpec;
}

export type LeaderboardScope = "friends" | "daily" | "weekly" | "monthly" | "all";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: AvatarSpec;
  /** Points for the selected scope. */
  points: number;
  isMe: boolean;
  /** Friends scope only: today's points and all-time total. */
  today?: number | null;
  total?: number;
}

export interface FriendEntry {
  userId: string;
  username: string;
  avatar: AvatarSpec;
  todayPoints: number | null;
  totalPoints: number;
}

export interface HistoryEntry extends Attempt {
  subject: string;
  category: Category;
  image: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
