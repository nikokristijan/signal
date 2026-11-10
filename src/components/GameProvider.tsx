"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { localDateKey } from "@/lib/game/dates";
import { computeStats, type Stats } from "@/lib/game/stats";
import type { Attempt, GuessOutcome, Profile, PublicChallenge, Reveal } from "@/lib/game/types";
import { getRepository } from "@/lib/repo";
import type { GameRepository } from "@/lib/repo/types";

interface GameContextValue {
  ready: boolean;
  repo: GameRepository | null;
  today: string;
  profile: Profile | null;
  challenge: PublicChallenge | null;
  attempt: Attempt | null;
  reveal: Reveal | null;
  attempts: Attempt[];
  stats: Stats;
  startToday(): Promise<void>;
  guess(text: string): Promise<GuessOutcome | null>;
  revealNext(): Promise<void>;
  giveUp(): Promise<void>;
  refresh(): Promise<void>;
  /** Called by the countdown at midnight: re-reads the local date and loads the new challenge. */
  rollover(): void;
  setProfile(p: Profile): void;
}

const emptyStats: Stats = computeStats([], "1970-01-01");
const GameContext = createContext<GameContextValue | null>(null);

/** In development `?date=YYYY-MM-DD` simulates another day (kept for the browser session). */
function resolveToday(): string {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    try {
      const q = new URLSearchParams(window.location.search).get("date");
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) window.sessionStorage.setItem("signal:dev-date", q);
      const stored = window.sessionStorage.getItem("signal:dev-date");
      if (stored) return stored;
    } catch {
      /* ignore */
    }
  }
  return localDateKey();
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<GameRepository | null>(null);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(() => localDateKey());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [challenge, setChallenge] = useState<PublicChallenge | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const repoRef = useRef<GameRepository | null>(null);

  const load = useCallback(async (r: GameRepository, dateKey: string) => {
    const p = await r.ensureProfile();
    setProfile(p);
    if (!p) {
      setReady(true);
      return;
    }
    const c = await r.getChallenge(dateKey);
    const a = await r.getAttempt(c.id);
    const all = await r.listAttempts();
    const streak = await r.getStreak(dateKey);
    const s = { ...computeStats(all, dateKey), currentStreak: streak.current, longestStreak: streak.longest };
    setChallenge(c);
    setAttempt(a);
    setAttempts(all);
    setStats(s);
    setReveal(a && a.status !== "playing" ? await r.getReveal(c.id) : null);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getRepository();
      if (cancelled) return;
      repoRef.current = r;
      setRepo(r);
      const dateKey = resolveToday();
      setToday(dateKey);
      await load(r, dateKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    if (repoRef.current) await load(repoRef.current, today);
  }, [load, today]);

  const startToday = useCallback(async () => {
    const r = repoRef.current;
    if (!r || !challenge) return;
    const a = await r.startAttempt(challenge);
    setAttempt(a);
  }, [challenge]);

  const finishIfDone = useCallback(
    async (a: Attempt) => {
      setAttempt(a);
      const r = repoRef.current;
      if (!r) return;
      if (a.status !== "playing") {
        setReveal(await r.getReveal(a.challengeId));
        const all = await r.listAttempts();
        const streak = await r.getStreak(today);
        setAttempts(all);
        setStats({ ...computeStats(all, today), currentStreak: streak.current, longestStreak: streak.longest });
      }
    },
    [today],
  );

  const guess = useCallback(
    async (text: string) => {
      const r = repoRef.current;
      if (!r || !attempt) return null;
      const outcome = await r.submitGuess(attempt.challengeId, text);
      await finishIfDone(outcome.attempt);
      return outcome;
    },
    [attempt, finishIfDone],
  );

  const revealNext = useCallback(async () => {
    const r = repoRef.current;
    if (!r || !attempt) return;
    await finishIfDone(await r.revealNextStage(attempt.challengeId));
  }, [attempt, finishIfDone]);

  const giveUp = useCallback(async () => {
    const r = repoRef.current;
    if (!r || !attempt) return;
    await finishIfDone(await r.giveUp(attempt.challengeId));
  }, [attempt, finishIfDone]);

  const rollover = useCallback(() => {
    const r = repoRef.current;
    if (!r) return;
    const dateKey = resolveToday();
    setToday(dateKey);
    void load(r, dateKey);
  }, [load]);

  const value = useMemo<GameContextValue>(
    () => ({ ready, repo, today, profile, challenge, attempt, reveal, attempts, stats, startToday, guess, revealNext, giveUp, refresh, rollover, setProfile }),
    [ready, repo, today, profile, challenge, attempt, reveal, attempts, stats, startToday, guess, revealNext, giveUp, refresh, rollover],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
