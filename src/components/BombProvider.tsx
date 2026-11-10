"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sfx } from "@/lib/audio";
import { zagrebDateKey, challengeNumber } from "@/lib/game/dates";
import { computeStats, type Stats } from "@/lib/game/stats";
import type { GameResult, Profile } from "@/lib/game/types";
import { loadSettings, saveSettings, type Settings } from "@/lib/progress";
import { getRepository } from "@/lib/repo";
import type { BombRepository, LeagueStatus } from "@/lib/repo/types";

interface Ctx {
  ready: boolean;
  repo: BombRepository | null;
  /** Današnji datum u Zagrebu (YYYY-MM-DD). */
  today: string;
  number: number;
  profile: Profile | null;
  /** Stanje dnevne lige. */
  daily: LeagueStatus | null;
  /** Stanje trening lige. */
  training: LeagueStatus | null;
  results: GameResult[];
  /** Statistika dnevne lige. */
  stats: Stats;
  trainingStats: Stats;
  settings: Settings;
  setSettings(patch: Partial<Settings>): void;
  refresh(): Promise<void>;
  /** Poziva ga odbrojavanje u ponoć: učitava novi dan. */
  rollover(): void;
  setProfile(p: Profile): void;
}

const emptyStats = computeStats([], "1970-01-01");
const BombContext = createContext<Ctx | null>(null);

/** U razvoju `?datum=YYYY-MM-DD` simulira drugi dan (zadržava se za sesiju preglednika). U produkciji je isključeno. */
function resolveToday(): string {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    try {
      const q = new URLSearchParams(window.location.search).get("datum");
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) window.sessionStorage.setItem("bomba:dev-date", q);
      const stored = window.sessionStorage.getItem("bomba:dev-date");
      if (stored) return stored;
    } catch {
      /* ignore */
    }
  }
  return zagrebDateKey();
}

export function BombProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<BombRepository | null>(null);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(() => zagrebDateKey());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [daily, setDaily] = useState<LeagueStatus | null>(null);
  const [training, setTraining] = useState<LeagueStatus | null>(null);
  const [results, setResults] = useState<GameResult[]>([]);
  const [settings, setSettingsState] = useState<Settings>({ sound: true, vibrate: true });
  const repoRef = useRef<BombRepository | null>(null);

  const load = useCallback(async (r: BombRepository, date: string) => {
    const p = await r.ensureProfile();
    setProfile(p);
    if (!p) {
      setReady(true);
      return;
    }
    const [d, t, list] = await Promise.all([r.getStatus("daily", date), r.getStatus("training", date), r.listResults()]);
    setDaily(d);
    setTraining(t);
    setResults(list);
    setReady(true);
  }, []);

  useEffect(() => {
    const s = loadSettings();
    setSettingsState(s);
    sfx.setEnabled(s.sound);
    let off = false;
    (async () => {
      const r = await getRepository();
      if (off) return;
      repoRef.current = r;
      setRepo(r);
      const date = resolveToday();
      setToday(date);
      await load(r, date);
    })();
    return () => {
      off = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    if (repoRef.current) await load(repoRef.current, today);
  }, [load, today]);

  const rollover = useCallback(() => {
    const r = repoRef.current;
    if (!r) return;
    const date = resolveToday();
    setToday(date);
    void load(r, date);
  }, [load]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      sfx.setEnabled(next.sound);
      return next;
    });
  }, []);

  const stats = useMemo(() => (results.length ? computeStats(results, today, "daily") : emptyStats), [results, today]);
  const trainingStats = useMemo(() => (results.length ? computeStats(results, today, "training") : emptyStats), [results, today]);
  const value = useMemo<Ctx>(
    () => ({ ready, repo, today, number: challengeNumber(today), profile, daily, training, results, stats, trainingStats, settings, setSettings, refresh, rollover, setProfile }),
    [ready, repo, today, profile, daily, training, results, stats, trainingStats, settings, setSettings, refresh, rollover],
  );
  return <BombContext.Provider value={value}>{children}</BombContext.Provider>;
}

export function useBomb(): Ctx {
  const ctx = useContext(BombContext);
  if (!ctx) throw new Error("useBomb mora biti unutar <BombProvider>");
  return ctx;
}
