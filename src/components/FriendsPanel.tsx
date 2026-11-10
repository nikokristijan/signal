"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Mail, UserMinus, UserPlus } from "lucide-react";
import { MOCK_USERS } from "@/lib/repo/mock-community";
import { AVATAR_COLORS, AVATAR_KEYS } from "@/lib/avatars";
import type { FriendEntry } from "@/lib/game/types";
import { Avatar } from "./Avatar";
import { useBomb } from "./BombProvider";

export function ProfileCard() {
  const { repo, profile, setProfile } = useBomb();
  const [name, setName] = useState(profile?.username ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setName(profile?.username ?? ""), [profile?.username]);
  if (!profile || !repo) return null;
  const link = typeof window !== "undefined" ? `${window.location.origin}/pozivnica/${profile.username}` : "";

  async function save(e: FormEvent) {
    e.preventDefault();
    const r = await repo!.updateProfile({ username: name });
    if (r.ok) {
      setProfile(r.value);
      setMsg({ ok: true, text: "Spremljeno." });
    } else setMsg({ ok: false, text: r.error });
  }

  async function pick(color: string) {
    const r = await repo!.updateProfile({ avatar: { color } });
    if (r.ok) setProfile(r.value);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard nije dostupan */
    }
  }

  return (
    <section className="tile px-4 py-4" aria-labelledby="profil-h">
      <h2 id="profil-h" className="label">Tvoj profil</h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar username={profile.username} avatar={profile.avatar} size={52} />
        <form onSubmit={save} className="flex min-w-0 flex-1 gap-2">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setMsg(null); }}
            aria-label="Korisničko ime"
            maxLength={16}
            autoCapitalize="none"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 outline-none focus:border-ink"
          />
          <button className="btn-ghost" disabled={name.trim().toLowerCase() === profile.username}>Spremi</button>
        </form>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-signal-dark" : "text-danger"}`} role="status">{msg.text}</p>}
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Boja avatara">
        {AVATAR_KEYS.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={profile.avatar.color === k}
            aria-label={k}
            onClick={() => void pick(k)}
            className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-surface ${profile.avatar.color === k ? "ring-2 ring-ink" : ""}`}
            style={{ background: AVATAR_COLORS[k] }}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-sm font-bold">Pozovi prijatelje</p>
        <p className="text-sm text-muted">Pošalji korisničko ime ili ovaj link. Ne morate igrati istovremeno.</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-full bg-paper px-4 py-2.5 text-sm" data-testid="invite-link">{link}</code>
          <button className="btn-ghost" onClick={copy} aria-label="Kopiraj link">
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? "Kopirano" : "Kopiraj"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Supabase: anonimni račun treba povezati s e-mailom da se ne izgubi (npr. brisanje podataka preglednika). */
export function AccountCard() {
  const { repo, profile } = useBomb();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  if (!repo?.auth || !profile) return null;
  const auth = repo.auth;

  async function link(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const r = await auth.linkEmail(email.trim());
    if (r.ok) setState("sent");
    else {
      setError(r.error);
      setState("error");
    }
  }

  return (
    <section className="tile mt-4 px-4 py-4" aria-labelledby="racun-h" data-testid="account">
      <h2 id="racun-h" className="label">Račun</h2>
      {profile.anonymous ? (
        <>
          <p className="mt-2 text-sm text-muted">Igraš anonimno. Poveži e-mail da ne izgubiš niz dana, rezultate i prijatelje ako se podaci preglednika obrišu.</p>
          {state === "sent" ? (
            <p className="mt-3 text-sm text-signal-dark" role="status">Poslali smo potvrdu na {email}. Klikni poveznicu u e-mailu.</p>
          ) : (
            <form onSubmit={link} className="mt-3 flex gap-2">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tvoj@email.hr" aria-label="E-mail" className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 outline-none focus:border-ink" />
              <button className="btn-primary" disabled={state === "sending"}><Mail size={16} aria-hidden /> Poveži</button>
            </form>
          )}
          {state === "error" && <p className="mt-2 text-sm text-danger">{error}</p>}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">Povezano s <b className="text-ink">{profile.email}</b>.</p>
      )}
      <button className="mt-3 text-sm text-muted underline underline-offset-2" onClick={() => void auth.signOut().then(() => window.location.assign("/"))}>
        Odjava
      </button>
    </section>
  );
}

interface Status {
  mode: "demo" | "supabase";
  ready: boolean;
  schema?: { base: boolean; unlimitedGames: boolean; leagues: boolean };
}

const SETUP_URL = "https://github.com/nikokristijan/signal#supabase";

/**
 * Kaže zašto se (ne) mogu dodavati pravi prijatelji. Bez Supabasea aplikacija je u demo načinu:
 * podaci su u pregledniku, pa postoje samo simulirani igrači. Pravi prijatelji trebaju zajedničku bazu.
 */
export function ConnectionCard() {
  const { repo } = useBomb();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (repo?.mode !== "supabase") return;
    let off = false;
    fetch("/api/status")
      .then((r) => r.json() as Promise<Status>)
      .then((s) => !off && setStatus(s))
      .catch(() => !off && setStatus(null));
    return () => {
      off = true;
    };
  }, [repo?.mode]);

  if (!repo) return null;

  if (repo.mode === "local" || status?.mode === "demo") {
    return (
      <section className="tile mt-4 border-signal/40 bg-signal-tint px-4 py-4" aria-labelledby="povezivanje-h" data-testid="connection-demo">
        <h2 id="povezivanje-h" className="font-extrabold">Demo način: prijatelji su simulirani</h2>
        <p className="mt-1 text-sm text-ink/80">
          Dodavanje pravih ljudi traži zajedničku bazu, a ova je instalacija još nije spojena (podaci su samo u ovom pregledniku). Zasad možeš dodati simulirane igrače da vidiš kako ljestvice rade.
        </p>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold">Kako uključiti prave prijatelje (5 koraka)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink/80">
            <li>Napravi besplatan projekt na supabase.com.</li>
            <li>U <b>SQL Editor</b> zalijepi cijeli sadržaj datoteke <code>supabase/setup.sql</code> i pokreni.</li>
            <li>U <b>Authentication → Sign In / Providers</b> uključi <b>Allow anonymous sign-ins</b>.</li>
            <li>U Vercelu (Settings → Environment Variables) dodaj <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> i <code>SUPABASE_SERVICE_ROLE_KEY</code>.</li>
            <li>Ponovno pokreni deploy. Ova kartica će se promijeniti u „Povezano".</li>
          </ol>
          <a href={SETUP_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold underline underline-offset-2">
            Detaljne upute
          </a>
        </details>
      </section>
    );
  }

  if (!status) return null;
  const missing = status.schema && !status.ready ? [!status.schema.base && "0001_init.sql", !status.schema.unlimitedGames && "0002_neogranicene_partije.sql", !status.schema.leagues && "0003_lige.sql"].filter(Boolean) : [];
  return status.ready ? (
    <section className="tile mt-4 px-4 py-3 text-sm" data-testid="connection-ok">
      <p className="font-semibold text-signal-dark">✓ Povezano: dodani prijatelji su pravi igrači.</p>
      <p className="text-muted">Pošalji im svoj link ili korisničko ime. Ne morate igrati istovremeno.</p>
    </section>
  ) : (
    <section className="tile mt-4 border-danger/40 bg-danger-tint px-4 py-3 text-sm" role="alert" data-testid="connection-broken">
      <p className="font-semibold text-danger">Supabase je spojen, ali baza nije spremna.</p>
      <p className="text-ink/80">
        {missing.length ? <>Nedostaje: <code>{missing.join(", ")}</code>. Pokreni ih u SQL editoru.</> : "Provjeri varijable okoline i migracije."}
      </p>
    </section>
  );
}

export function FriendsList() {
  const { repo, today, profile } = useBomb();
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (repo) setFriends(await repo.listFriends(today));
  }, [repo, today]);

  useEffect(() => {
    void load();
  }, [load, profile?.id]);

  async function addByName(username: string) {
    if (!repo) return;
    const r = await repo.addFriend(username, today);
    if (r.ok) {
      setMsg({ ok: true, text: `Dodan: ${r.value.username}.` });
      setName("");
      await load();
    } else setMsg({ ok: false, text: r.error });
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    await addByName(name);
  }

  return (
    <section className="mt-6" aria-labelledby="prijatelji-h">
      <h2 id="prijatelji-h" className="text-xl font-extrabold">Prijatelji</h2>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setMsg(null); }}
          aria-label="Korisničko ime prijatelja"
          placeholder="Dodaj po korisničkom imenu"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-full border border-line bg-white px-5 py-3 outline-none focus:border-ink"
        />
        <button className="btn-primary" disabled={!name.trim()} data-testid="add-friend">
          <UserPlus size={16} aria-hidden /> Dodaj
        </button>
      </form>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-signal-dark" : "text-danger"}`} role="status" data-testid="friend-msg">{msg.text}</p>}

      {repo?.mode === "local" && friends && (
        <div className="mt-3" data-testid="suggestions">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Simulirani igrači (dodaj dodirom)</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MOCK_USERS.filter((u) => !friends.some((f) => f.userId === u.id))
              .slice(0, 8)
              .map((u) => (
                <button key={u.id} type="button" onClick={() => void addByName(u.username)} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:bg-raised" data-testid={`suggest-${u.username}`}>
                  + {u.username}
                </button>
              ))}
          </div>
        </div>
      )}

      {friends === null ? null : friends.length === 0 ? (
        <p className="tile mt-4 px-4 py-6 text-center text-muted">Još nemaš prijatelja. Dodaj nekoga po korisničkom imenu ili mu pošalji svoj link.</p>
      ) : (
        <ul className="tile mt-4 divide-y divide-line/70" data-testid="friends-list">
          {friends.map((f) => (
            <li key={f.userId} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar username={f.username} avatar={f.avatar} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{f.username}{f.simulated && <span className="ml-1.5 text-[10px] font-bold uppercase text-muted">simuliran</span>}</p>
                <p className="text-xs text-muted">
                  Danas {f.todayScore === null ? "još nije igrao" : `${f.todayScore} bod. (${f.todayWords} r.)`} · High score {f.bestScore.toLocaleString("hr")} · Trening {f.trainingBest.toLocaleString("hr")}
                </p>
              </div>
              <button onClick={() => void repo?.removeFriend(f.userId).then(load)} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink" aria-label={`Ukloni ${f.username}`}>
                <UserMinus size={17} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
