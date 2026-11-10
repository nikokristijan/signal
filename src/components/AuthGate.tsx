"use client";

import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { useBomb } from "./BombProvider";

/** Prikazuje se samo u Supabase načinu kad anonimna prijava nije uspjela ili za povratak na stari račun. */
export function AuthGate() {
  const { repo } = useBomb();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!repo?.auth) return;
    setState("sending");
    const r = await repo.auth.signInWithEmail(email.trim());
    if (r.ok) setState("sent");
    else {
      setError(r.error);
      setState("error");
    }
  }

  return (
    <section className="mx-auto max-w-sm text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">Prijava nije uspjela</h1>
      <p className="mt-2 text-muted">Anonimna prijava nije dostupna. Provjeri je li u Supabaseu uključena („Authentication → Sign In / Providers → Allow anonymous sign-ins"), ili se prijavi e-mailom ako već imaš povezan račun.</p>
      {state === "sent" ? (
        <p className="tile mt-6 p-4 text-sm" role="status">
          Provjeri <strong>{email}</strong>: poslali smo ti poveznicu za prijavu.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3 text-left">
          <label className="block text-sm font-semibold">
            E-mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-full border border-line bg-white px-5 py-3 outline-none focus:border-ink" />
          </label>
          {state === "error" && <p className="text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={state === "sending"}>
            <Mail size={16} aria-hidden /> Pošalji poveznicu
          </button>
        </form>
      )}
    </section>
  );
}
