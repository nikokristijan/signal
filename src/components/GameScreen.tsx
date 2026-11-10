"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Bomb, Check, Flame, Smartphone, Volume2, VolumeX } from "lucide-react";
import { START_LIVES } from "@/lib/game/constants";
import { LEAGUE_NAME } from "@/lib/game/seeds";
import { sfx } from "@/lib/audio";
import type { Mode } from "@/lib/game/constants";
import { useBombGame } from "@/hooks/useBombGame";
import { AuthGate } from "./AuthGate";
import { useBomb } from "./BombProvider";
import { BombView, type BombHandle } from "./BombView";
import { GhostBar } from "./GhostBar";
import { Loading } from "./Page";
import { ResultPanel } from "./ResultPanel";

export function GameScreen({ mode }: { mode: Mode }) {
  const { ready, profile, number, settings, setSettings, daily, training } = useBomb();
  const status = mode === "daily" ? daily : training;
  const bombRef = useRef<BombHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { ui, start, submit, retrySave, playAgain } = useBombGame(mode, bombRef);
  const [value, setValue] = useState("");
  const [shaking, setShaking] = useState(false);
  const [inputShaking, setInputShaking] = useState(false);
  const playing = ui.phase === "playing";

  // Tresenje inputa pri krivom unosu. Namjerno klasa koja se uključi/isključi, a NE `key`:
  // ponovno stvaranje inputa gubi fokus i zatvara tipkovnicu na mobitelu.
  useEffect(() => {
    if (!ui.inputShake) return;
    setInputShaking(true);
    const id = window.setTimeout(() => setInputShaking(false), 400);
    return () => window.clearTimeout(id);
  }, [ui.inputShake]);

  // Tresenje cijelog ekrana pri eksploziji.
  useEffect(() => {
    if (!ui.screenShake) return;
    setShaking(true);
    const id = window.setTimeout(() => setShaking(false), 540);
    return () => window.clearTimeout(id);
  }, [ui.screenShake]);

  // Input je uvijek u fokusu: tipkovnica na mobitelu se ne zatvara između riječi.
  useEffect(() => {
    if (ui.phase === "playing" || ui.phase === "exploding") inputRef.current?.focus({ preventScroll: true });
  }, [ui.phase, ui.syllable]);

  // Izvan partije (početni ekran, rezultat) tipkovnica se zatvara i polje se čisti.
  useEffect(() => {
    if (ui.phase === "idle" || ui.phase === "done") {
      setValue("");
      inputRef.current?.blur();
    }
  }, [ui.phase]);

  if (!ready) return <div className="min-h-dvh"><Loading /></div>;
  if (!profile) return <div className="px-4 py-10"><AuthGate /></div>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = value;
    if (!v.trim()) return;
    const r = await submit(v);
    if (r === "ok") setValue("");
    else if (r === "bad") inputRef.current?.select();
  }

  const onKeyDownAudio = () => sfx.unlock();

  if (ui.phase === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="text-center">
          <Loading />
          <p className="-mt-16 text-sm text-muted">Učitavam rječnik…</p>
        </div>
      </div>
    );
  }

  if (ui.phase === "error") {
    return (
      <div className="mx-auto min-h-dvh max-w-xl">
        <TopBar mode={mode} number={number} />
        <section className="px-5 py-10 text-center" role="alert">
          <h1 className="text-2xl font-extrabold">Nešto nije u redu</h1>
          <p className="mt-3 text-muted" data-testid="error-text">{ui.error}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button className="btn-primary flex-1" onClick={retrySave}>Pokušaj ponovno</button>
            <Link href="/" className="btn-ghost flex-1">Početna</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`relative mx-auto flex h-dvh max-w-xl flex-col overflow-hidden ${shaking ? "animate-shake-screen" : ""}`} data-testid="game" data-phase={ui.phase}>
      {ui.phase === "exploding" && <div key={ui.screenShake} className="pointer-events-none absolute inset-0 z-30 animate-flash bg-[#e8833a]/20" aria-hidden />}

      <TopBar mode={mode} number={number} settings={settings} onSettings={setSettings} />

      {/* HUD: životi · bodovi · combo */}
      <div className="grid grid-cols-3 items-center px-5 pt-1">
        <div className="flex items-center gap-1.5" data-testid="lives" aria-label={`Životi: ${ui.lives}`}>
          {Array.from({ length: START_LIVES }, (_, i) => (
            <Bomb key={i} size={24} strokeWidth={2} className={i < ui.lives ? "text-ink" : "text-line"} fill={i < ui.lives ? "currentColor" : "none"} data-testid={i < ui.lives ? "life-on" : "life-off"} />
          ))}
        </div>
        <div className="text-center">
          <p className="text-4xl font-extrabold leading-none tabular-nums" data-testid="score">{ui.score}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted" data-testid="words-count">
            {ui.words} {ui.words % 10 === 1 && ui.words % 100 !== 11 ? "riječ" : "riječi"}
          </p>
        </div>
        <div className="flex justify-end">
          {ui.combo > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-signal-tint px-2.5 py-1 text-sm font-bold text-signal-dark" data-testid="combo">
              <Flame size={14} aria-hidden /> ×{ui.combo}
            </span>
          )}
        </div>
      </div>

      <GhostBar words={ui.words} ghosts={ui.ghosts} />

      {/* bomba */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center pb-2">
        <BombView ref={bombRef} syllable={ui.syllable || "?"} exploding={ui.phase === "exploding"} key={ui.phase === "exploding" ? "boom" : `s-${ui.words}-${ui.lives}-${ui.syllable}`} />
        <p className="mt-1.5 h-4 text-xs font-semibold text-signal-dark" data-testid="bonus-time">
          {ui.lastFast && playing ? "+1 s bonus vremena" : ""}
        </p>
        {ui.popup && (
          <div key={ui.popup.key} className="pointer-events-none absolute left-[14%] top-[6%] animate-float-up" data-testid="popup">
            <p className="text-3xl font-extrabold tabular-nums text-signal-dark">{ui.popup.text}</p>
          </div>
        )}
        {ui.overtaken && (
          <div key={ui.overtaken.key} className="pointer-events-none absolute left-1/2 top-0 z-20 w-max max-w-[92%] -translate-x-1/2 animate-toast" role="status" data-testid="overtaken">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-semibold shadow-sm">
              <Check size={15} className="text-signal-dark" aria-hidden /> Prestigao si {ui.overtaken.names}!
            </span>
          </div>
        )}
      </div>

      {/* unos */}
      <form onSubmit={onSubmit} className="px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3" autoComplete="off">
        <div className="mb-1.5 h-6 text-center" role="status" aria-live="polite">
          {ui.feedback && (
            <span key={ui.feedback.key} className="animate-fade-up inline-block rounded-full bg-danger-tint px-3 py-0.5 text-sm font-bold text-danger" data-testid="feedback">
              {ui.feedback.text}
            </span>
          )}
        </div>
        <div className={inputShaking ? "animate-shake" : ""}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDownAudio}
            onBlur={() => {
              if (phaseIsLive(ui.phase)) window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
            }}
            aria-label="Upiši riječ koja sadrži slog"
            placeholder={playing ? `Riječ sa slogom ${ui.syllable.toUpperCase()}…` : ""}
            enterKeyHint="send"
            inputMode="text"
            lang="hr"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
            data-testid="input"
            className={`w-full rounded-full border-2 bg-surface px-5 py-3.5 text-lg font-semibold outline-none placeholder:text-muted/60 ${
              ui.feedback ? "border-danger" : "border-line focus:border-ink"
            }`}
          />
        </div>
      </form>

      {/* rezultat: preklop preko igre; input ostaje u DOM-u pa „Igraj ponovno" može odmah otvoriti tipkovnicu (iOS) */}
      {ui.phase === "done" && ui.result && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-paper">
          <TopBar mode={mode} number={number} />
          <ResultPanel
            result={ui.result}
            info={ui.info}
            onAgain={() => {
              inputRef.current?.focus({ preventScroll: true });
              void playAgain();
            }}
          />
        </div>
      )}

      {/* početni ekran: input je već u DOM-u pa se može fokusirati unutar geste klika (iOS) */}
      {ui.phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col bg-paper">
          <TopBar mode={mode} number={number} settings={settings} onSettings={setSettings} />
          <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <Bomb size={56} className="text-ink" strokeWidth={1.8} aria-hidden />
            <h1 className="mt-3 text-3xl font-extrabold">{LEAGUE_NAME[mode]}</h1>
            {mode === "daily" && <p className="mt-1 text-sm font-semibold text-muted">Izazov #{number}</p>}
            <ol className="mt-4 space-y-2 text-left text-[15px] text-muted">
              <li><b className="text-ink">1.</b> Na bombi je slog od 2–3 slova.</li>
              <li><b className="text-ink">2.</b> Upiši riječ koja ga sadrži i pritisni Enter.</li>
              <li><b className="text-ink">3.</b> Stigni prije nego bomba eksplodira. Imaš {START_LIVES} života.</li>
              <li><b className="text-ink">4.</b> Što je riječ duža, to više bodova.</li>
            </ol>
            <button
              className="btn-primary btn-lg mt-7 w-full max-w-xs"
              data-testid="start"
              onClick={() => {
                inputRef.current?.focus({ preventScroll: true });
                void start(); // prva partija (u treningu poštuje ?seed=)
              }}
            >
              Kreni
            </button>
            {status?.best ? (
              <p className="mt-4 text-sm text-muted" data-testid="idle-best">
                Najbolje danas: <b className="text-ink">{status.best.score}</b> · {status.gamesToday} {status.gamesToday === 1 ? "partija" : "partija"}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted">{mode === "daily" ? "Svi danas igraju isti niz slogova. Igraj koliko god puta želiš: računa se tvoj najbolji rezultat." : "Svaka partija ima nove slogove. Igraj koliko god puta želiš: računa se tvoj najbolji rezultat u trening ligi."}</p>
          </section>
        </div>
      )}
    </div>
  );
}

function phaseIsLive(p: string) {
  return p === "playing" || p === "exploding";
}

function TopBar({ mode, number, settings, onSettings }: { mode: Mode; number: number; settings?: { sound: boolean; vibrate: boolean }; onSettings?: (p: { sound?: boolean; vibrate?: boolean }) => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-2">
      <Link href="/" className="grid h-11 w-11 place-items-center rounded-full hover:bg-raised" aria-label="Natrag na početnu">
        <ArrowLeft size={22} />
      </Link>
      <p className="text-sm font-extrabold uppercase tracking-[0.16em]">{mode === "daily" ? `Dnevna liga #${number}` : "Trening liga"}</p>
      <div className="flex w-[92px] justify-end">
        {settings && onSettings ? (
          <>
            <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-raised" onClick={() => { sfx.unlock(); onSettings({ sound: !settings.sound }); }} aria-label={settings.sound ? "Isključi zvuk" : "Uključi zvuk"} aria-pressed={settings.sound} data-testid="toggle-sound">
              {settings.sound ? <Volume2 size={20} /> : <VolumeX size={20} className="text-muted" />}
            </button>
            <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-raised" onClick={() => onSettings({ vibrate: !settings.vibrate })} aria-label={settings.vibrate ? "Isključi vibraciju" : "Uključi vibraciju"} aria-pressed={settings.vibrate}>
              <Smartphone size={20} className={settings.vibrate ? "" : "text-muted"} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
