"use client";

import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { useGame } from "./GameProvider";

/** Shown in Supabase mode until the player has signed in (email magic link). */
export function AuthGate() {
  const { repo } = useGame();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!repo?.auth) return;
    setState("sending");
    const res = await repo.auth.signInWithEmail(email.trim(), username.trim().toLowerCase());
    if (res.ok) setState("sent");
    else {
      setError(res.error);
      setState("error");
    }
  }

  return (
    <section className="mx-auto max-w-sm text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">Sign in to play</h1>
      <p className="mt-2 text-muted">We&apos;ll email you a magic link. No password needed.</p>
      {state === "sent" ? (
        <p className="mt-6 rounded-lg border border-line bg-white p-4 text-sm" role="status">
          Check <strong>{email}</strong> for your sign-in link.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3 text-left">
          <label className="block text-sm font-medium">
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-full border border-line bg-white px-5 py-3 outline-none focus:border-ink" />
          </label>
          <label className="block text-sm font-medium">
            Username <span className="text-muted">(new players)</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–16 letters, numbers, _" className="mt-1 w-full rounded-full border border-line bg-white px-5 py-3 outline-none focus:border-ink" />
          </label>
          {state === "error" && <p className="text-sm text-miss">{error}</p>}
          <button className="btn-primary w-full" disabled={state === "sending"}>
            <Mail size={16} aria-hidden /> Send magic link
          </button>
        </form>
      )}
    </section>
  );
}
