"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronsRight, Send } from "lucide-react";
import { STAGE_COUNT, WRONG_PENALTY, currentScore, stagePoints } from "@/lib/game/scoring";
import type { Attempt, GuessOutcome } from "@/lib/game/types";

interface Props {
  attempt: Attempt;
  onGuess(text: string): Promise<GuessOutcome | null>;
  onReveal(): Promise<void>;
  onGiveUp(): Promise<void>;
}

type Feedback = { kind: "wrong" | "close" | "duplicate"; text: string; key: number } | null;

export function GuessForm({ attempt, onGuess, onReveal, onGiveUp }: Props) {
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const possible = stagePoints(attempt.stage);
  const remaining = currentScore(attempt.stage, attempt.wrongCount);
  const lastStage = attempt.stage >= STAGE_COUNT;
  const wrongGuesses = attempt.guesses.filter((g) => !g.correct);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const outcome = await onGuess(value);
      if (!outcome) return;
      const key = Date.now();
      if (outcome.verdict === "wrong") {
        setFeedback({ kind: "wrong", text: `Nije to. −${outcome.penalty} bodova`, key });
        setValue("");
      } else if (outcome.verdict === "close") {
        setFeedback({ kind: "close", text: "Blizu, ali budi precizniji. Bodovi nisu izgubljeni.", key });
      } else if (outcome.verdict === "duplicate") {
        setFeedback({ kind: "duplicate", text: "To si već probao. Bodovi nisu izgubljeni.", key });
      } else {
        setFeedback(null);
      }
    } finally {
      setBusy(false);
      inputRef.current?.focus({ preventScroll: true });
    }
  }

  async function reveal() {
    await onReveal();
    setFeedback(null);
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <section aria-labelledby="question" className="mt-5">
      <h2 id="question" className="text-center text-xl font-bold">
        Što je na slici?
      </h2>

      <form onSubmit={submit} className="mt-3 flex gap-2" autoComplete="off">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Tvoj odgovor"
          aria-describedby="feedback"
          placeholder="Upiši odgovor…"
          enterKeyHint="send"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={60}
          className="min-w-0 flex-1 rounded-full border border-line bg-white px-5 py-3 text-base outline-none placeholder:text-muted/70 focus:border-ink"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!value.trim() || busy} data-testid="submit">
          <Send size={16} aria-hidden /> Pošalji
        </button>
      </form>

      <div id="feedback" role="status" aria-live="polite" className="mt-2 min-h-[28px]">
        {feedback && (
          <p
            key={feedback.key}
            data-testid="feedback"
            data-kind={feedback.kind}
            className={`animate-fade-up inline-block rounded-full px-3 py-1 text-sm font-medium ${
              feedback.kind === "wrong" ? "bg-miss-tint text-miss" : "bg-soft text-muted"
            }`}
          >
            {feedback.text}
          </p>
        )}
      </div>

      {wrongGuesses.length > 0 && (
        <p className="mt-1 text-sm text-muted" data-testid="wrong-guesses">
          Pokušano:{" "}
          {wrongGuesses.map((g, i) => (
            <span key={g.text + i}>
              {i > 0 && " · "}
              <span className="line-through decoration-miss/60">{g.text}</span>
            </span>
          ))}
        </p>
      )}

      <button type="button" onClick={reveal} disabled={lastStage || busy} className="btn-secondary mt-4 w-full" data-testid="reveal">
        <ChevronsRight size={18} aria-hidden />
        {lastStage ? "Ovo je zadnja razina" : `Otkrij sljedeći zoom · vrijedi ${stagePoints(attempt.stage + 1)} bod.`}
      </button>

      <dl className="mt-4 grid grid-cols-2 divide-x divide-line rounded-lg border border-line bg-white text-center">
        <div className="px-3 py-2.5">
          <dt className="label">Mogući bodovi</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums" data-testid="possible-points">
            {possible}
          </dd>
        </div>
        <div className="px-3 py-2.5">
          <dt className="label">Preostali bodovi</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-signal-dark" data-testid="remaining-score">
            {remaining}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-center text-xs text-muted">Svaki krivi odgovor košta {WRONG_PENALTY} bodova.</p>

      <div className="mt-3 text-center">
        {confirmGiveUp ? (
          <span className="text-sm">
            Otkriti odgovor uz 0 bodova?{" "}
            <button className="font-semibold text-miss underline underline-offset-2" onClick={() => void onGiveUp()} data-testid="give-up-confirm">
              Da, odustajem
            </button>{" "}
            ·{" "}
            <button className="font-semibold underline underline-offset-2" onClick={() => setConfirmGiveUp(false)}>
              Igram dalje
            </button>
          </span>
        ) : (
          <button className="text-sm text-muted underline underline-offset-2 hover:text-ink" onClick={() => setConfirmGiveUp(true)} data-testid="give-up">
            Odustani
          </button>
        )}
      </div>
    </section>
  );
}
