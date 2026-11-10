"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { BombHandle } from "@/components/BombView";
import { useBomb } from "@/components/BombProvider";
import { sfx, vibrate } from "@/lib/audio";
import { DictClient } from "@/lib/dict/client";
import { loadDictionary } from "@/lib/dict/loader";
import { REJECTION_TEXT } from "@/lib/dict/resolve";
import type { Mode } from "@/lib/game/constants";
import { dailySeed } from "@/lib/game/dates";
import { minTypingMs, replayLog, summarize } from "@/lib/game/replay";
import { applyBoom, applyWord, initialState, timeLimitMs } from "@/lib/game/rules";
import { syllableAt } from "@/lib/game/syllables";
import type { GameResult, GameState, Ghost, LogEntry } from "@/lib/game/types";
import { clearProgress, loadProgress, saveProgress } from "@/lib/progress";

export type Phase = "loading" | "idle" | "playing" | "exploding" | "saving" | "done" | "blocked" | "error";

export interface Popup {
  key: number;
  text: string;
}

export interface UI {
  phase: Phase;
  syllable: string;
  lives: number;
  score: number;
  combo: number;
  words: number;
  lastFast: boolean;
  limitMs: number;
  feedback: { key: number; text: string } | null;
  popup: Popup | null;
  overtaken: { key: number; names: string } | null;
  /** Povećava se pri svakoj eksploziji (tresenje ekrana) odnosno krivom unosu (tresenje inputa). */
  screenShake: number;
  inputShake: number;
  result: GameResult | null;
  error: string | null;
  ghosts: Ghost[];
}

const initialUI: UI = {
  phase: "loading",
  syllable: "",
  lives: 2,
  score: 0,
  combo: 0,
  words: 0,
  lastFast: false,
  limitMs: 10000,
  feedback: null,
  popup: null,
  overtaken: null,
  screenShake: 0,
  inputShake: 0,
  result: null,
  error: null,
  ghosts: [],
};

const EXPLODE_MS = 1300;
const newTrainingSeed = () => `trening:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Trening može dobiti zadani niz slogova preko ?seed=… (npr. da isti niz odigraju prijatelji). Ne ide na ljestvicu. */
function initialTrainingSeed(): string {
  try {
    const q = new URLSearchParams(window.location.search).get("seed");
    if (q && /^[\w-]{1,40}$/.test(q)) return `trening:${q}`;
  } catch {
    /* SSR ili nedostupno */
  }
  return newTrainingSeed();
}

/**
 * Cijela petlja igre. Pravila (tajmer, combo, životi, bodovi) dolaze iz src/lib/game/rules.ts,
 * a konačne bodove za dnevni izazov računa SERVER ponovnim odigravanjem zapisa.
 */
export function useBombGame(mode: Mode, bombRef: RefObject<BombHandle | null>) {
  const { ready, repo, profile, today, daily, settings, refresh } = useBomb();
  const [ui, setUi] = useState<UI>(initialUI);
  const patch = useCallback((p: Partial<UI>) => setUi((u) => ({ ...u, ...p })), []);

  const seedRef = useRef(mode === "daily" ? dailySeed(today) : initialTrainingSeed());
  const dictRef = useRef<DictClient | null>(null);
  const gameRef = useRef<GameState>(initialState());
  const logRef = useRef<LogEntry[]>([]);
  const startedAtRef = useRef(0);
  const shownAtRef = useRef(0);
  const shownEpochRef = useRef(0);
  const limitRef = useRef(10000);
  const tokenRef = useRef(0);
  const phaseRef = useRef<Phase>("loading");
  const rafRef = useRef(0);
  const nextTickRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const announcedRef = useRef(new Set<string>());
  const ghostsRef = useRef<Ghost[]>([]);
  const dailyRef = useRef(daily);
  const settingsRef = useRef(settings);
  const cancelledRef = useRef(false);
  dailyRef.current = daily;
  settingsRef.current = settings;
  seedRef.current = mode === "daily" ? dailySeed(today) : seedRef.current;

  const setPhase = useCallback(
    (p: Phase) => {
      phaseRef.current = p;
      patch({ phase: p });
    },
    [patch],
  );

  const persist = useCallback(() => {
    if (mode !== "daily") return;
    saveProgress({ v: 1, date: today, startedAt: startedAtRef.current, log: [...logRef.current], shownAt: shownEpochRef.current });
  }, [mode, today]);

  const syncState = useCallback(() => {
    const g = gameRef.current;
    patch({ lives: g.lives, score: g.score, combo: g.combo, words: g.successes, lastFast: g.lastFast });
  }, [patch]);

  /* ─────────────── završetak partije ─────────────── */
  const finish = useCallback(async () => {
    setPhase("saving");
    persist();
    const g = gameRef.current;
    const log = logRef.current;
    if (mode === "training") {
      const s = summarize(g, log);
      patch({ phase: "done", result: { ...s, mode: "training", date: today, number: 0, finishedAt: new Date().toISOString() } });
      phaseRef.current = "done";
      return;
    }
    const r = await repo?.finishDaily(today, [...log]);
    if (cancelledRef.current) return;
    if (!r || !r.ok) {
      patch({ phase: "error", error: r ? r.error : "Nema veze s pozadinom." });
      phaseRef.current = "error";
      return;
    }
    clearProgress();
    patch({ phase: "done", result: r.value, error: null });
    phaseRef.current = "done";
    await refresh();
  }, [mode, patch, persist, refresh, repo, setPhase, today]);

  /* ─────────────── petlja tajmera ─────────────── */
  const boom = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    cancelAnimationFrame(rafRef.current);
    tokenRef.current++;
    logRef.current.push({ w: null, t: limitRef.current });
    gameRef.current = applyBoom(gameRef.current);
    phaseRef.current = "exploding";
    sfx.boom();
    if (settingsRef.current.vibrate) vibrate([220, 80, 260]);
    setUi((u) => ({ ...u, phase: "exploding", feedback: null, popup: null, screenShake: u.screenShake + 1 }));
    syncState();
    persist();
    timeoutRef.current = window.setTimeout(() => {
      if (cancelledRef.current) return;
      if (gameRef.current.over) void finish();
      else showSyllable();
    }, EXPLODE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish, persist, syncState]);

  const loop = useCallback(() => {
    const frame = () => {
      if (phaseRef.current !== "playing") return;
      const now = performance.now();
      const remaining = limitRef.current - (now - shownAtRef.current);
      if (remaining <= 0) {
        boom();
        return;
      }
      const p = remaining / limitRef.current;
      bombRef.current?.update(p, (remaining / 1000).toFixed(1).replace(".", ","));
      if (now >= nextTickRef.current) {
        const urgency = 1 - p;
        sfx.tick(urgency);
        nextTickRef.current = now + 900 - 740 * urgency;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frame);
  }, [boom, bombRef]);

  /** Prikazuje sljedeći slog i pokreće tajmer. `elapsedMs`/`epoch` služe za nastavak nakon refresha. */
  const showSyllable = useCallback(
    (elapsedMs = 0, epoch?: number) => {
      const g = gameRef.current;
      const syllable = syllableAt(seedRef.current, g.step);
      const limit = timeLimitMs(g);
      tokenRef.current++;
      limitRef.current = limit;
      shownAtRef.current = performance.now() - elapsedMs;
      shownEpochRef.current = epoch ?? Date.now();
      nextTickRef.current = 0;
      phaseRef.current = "playing";
      setUi((u) => ({
        ...u,
        phase: "playing",
        syllable,
        limitMs: limit,
        lives: g.lives,
        score: g.score,
        combo: g.combo,
        words: g.successes,
        lastFast: g.lastFast,
      }));
      persist();
      loop();
    },
    [loop, persist],
  );

  /* ─────────────── unos riječi ─────────────── */
  /** Vraća "ok" (prihvaćeno), "bad" (odbijeno, tekst ostaje) ili "ignored". */
  const submit = useCallback(
    async (raw: string): Promise<"ok" | "bad" | "ignored"> => {
      if (phaseRef.current !== "playing" || !dictRef.current) return "ignored";
      const t = performance.now() - shownAtRef.current; // vrijeme se mjeri u trenutku Entera, ne nakon provjere
      const token = tokenRef.current;
      if (t >= limitRef.current) return "ignored";
      const syllable = syllableAt(seedRef.current, gameRef.current.step);
      const res = await dictRef.current.check(raw, syllable, gameRef.current.used);
      if (token !== tokenRef.current || phaseRef.current !== "playing") return "ignored"; // bomba je u međuvremenu eksplodirala

      const reject = (text: string) => {
        sfx.bad();
        setUi((u) => ({ ...u, feedback: { key: Date.now(), text }, inputShake: u.inputShake + 1 }));
        return "bad" as const;
      };
      if (!res.ok) return reject(REJECTION_TEXT[res.reason]);

      const ms = Math.round(t);
      if (ms < minTypingMs(res.word.length)) return reject("Prebrzo!"); // isto pravilo kao na serveru

      logRef.current.push({ w: raw.trim().toLocaleLowerCase("hr"), t: ms });
      const applied = applyWord(gameRef.current, syllable, res.word, ms);
      gameRef.current = applied.state;
      const g = applied.state;
      sfx.good(g.combo);

      // „Prestigao si Ivana!"
      const passed = ghostsRef.current.filter((gh) => gh.words < g.successes && !announcedRef.current.has(gh.userId));
      passed.forEach((gh) => announcedRef.current.add(gh.userId));
      if (passed.length) {
        sfx.overtake();
        if (settingsRef.current.vibrate) vibrate(30);
      }

      setUi((u) => ({
        ...u,
        feedback: null,
        popup: { key: Date.now(), text: `+${applied.points}` },
        overtaken: passed.length ? { key: Date.now(), names: passed.map((p) => p.username).join(" i ") } : u.overtaken,
      }));
      showSyllable();
      return "ok";
    },
    [showSyllable],
  );

  /* ─────────────── početak i nastavak ─────────────── */
  const resetGame = useCallback(() => {
    gameRef.current = initialState();
    logRef.current = [];
    announcedRef.current = new Set();
    patch({ result: null, error: null, feedback: null, popup: null, overtaken: null });
  }, [patch]);

  const start = useCallback(async () => {
    sfx.unlock();
    if (mode === "daily") {
      const r = await repo?.startDaily(today);
      if (!r || !r.ok) {
        patch({ phase: "error", error: r ? r.error : "Nema veze s pozadinom." });
        phaseRef.current = "error";
        return;
      }
      if (r.value.state === "finished" && r.value.result) {
        patch({ phase: "done", result: r.value.result });
        phaseRef.current = "done";
        return;
      }
      startedAtRef.current = r.value.startedAt;
    }
    resetGame();
    showSyllable();
  }, [mode, patch, repo, resetGame, showSyllable, today]);

  const restartTraining = useCallback(() => {
    seedRef.current = newTrainingSeed();
    resetGame();
    syncState();
    sfx.unlock();
    showSyllable();
  }, [resetGame, showSyllable, syncState]);

  const retrySave = useCallback(() => {
    patch({ error: null });
    void finish();
  }, [finish, patch]);

  /* ─────────────── inicijalizacija ─────────────── */
  useEffect(() => {
    if (!ready || !profile) return;
    cancelledRef.current = false;
    const dict = new DictClient();
    dictRef.current = dict;
    patch({ phase: "loading" });
    phaseRef.current = "loading";

    (async () => {
      const ghosts = mode === "daily" ? await repo?.getGhosts(today).catch(() => [] as Ghost[]) : [];
      if (cancelledRef.current) return;
      ghostsRef.current = ghosts ?? [];
      patch({ ghosts: ghosts ?? [] });
      try {
        await dict.ready;
      } catch {
        if (!cancelledRef.current) patch({ phase: "error", error: "Rječnik se nije učitao. Provjeri vezu i osvježi stranicu." });
        return;
      }
      if (cancelledRef.current) return;

      const d = dailyRef.current;
      if (mode === "daily" && d) {
        if (d.state === "finished" && d.result) {
          patch({ phase: "done", result: d.result });
          phaseRef.current = "done";
          return;
        }
        if (d.state === "playing") {
          const progress = loadProgress(today);
          if (!progress) {
            setPhase("blocked"); // partija je započeta, ali se ne može nastaviti (npr. drugi uređaj)
            return;
          }
          // Refresh = nastavak: rekonstruiraj stanje iz zapisa.
          const mainDict = await loadDictionary();
          if (cancelledRef.current) return;
          const rep = replayLog(seedRef.current, progress.log, mainDict, { requireOver: false, strict: false });
          if (!rep.ok) {
            patch({ phase: "error", error: "Spremljena partija je neispravna: " + rep.error });
            phaseRef.current = "error";
            return;
          }
          gameRef.current = rep.value.state;
          logRef.current = [...progress.log];
          startedAtRef.current = progress.startedAt;
          shownEpochRef.current = progress.shownAt;
          syncState();
          if (gameRef.current.over) {
            void finish();
            return;
          }
          const elapsed = Date.now() - progress.shownAt;
          const limit = timeLimitMs(gameRef.current);
          if (elapsed >= limit) {
            // dok te nije bilo, tajmer je istekao: bomba je eksplodirala
            logRef.current.push({ w: null, t: limit });
            gameRef.current = applyBoom(gameRef.current);
            syncState();
            persist();
            if (gameRef.current.over) {
              void finish();
              return;
            }
            showSyllable();
            return;
          }
          showSyllable(elapsed, progress.shownAt);
          return;
        }
      }
      setPhase("idle");
    })();

    return () => {
      cancelledRef.current = true;
      cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      dict.dispose();
      dictRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profile?.id, mode, today]);

  return { ui, start, submit, retrySave, restartTraining };
}
