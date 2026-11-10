"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, UserMinus, UserPlus } from "lucide-react";
import { AVATAR_COLORS, AVATAR_KEYS } from "@/lib/avatars";
import type { FriendEntry } from "@/lib/game/types";
import { Avatar } from "./Avatar";
import { useGame } from "./GameProvider";

export function ProfileCard() {
  const { repo, profile, setProfile } = useGame();
  const [name, setName] = useState(profile?.username ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setName(profile?.username ?? ""), [profile?.username]);
  if (!profile || !repo) return null;

  const link = typeof window !== "undefined" ? `${window.location.origin}/invite/${profile.username}` : "";

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await repo!.updateProfile({ username: name });
    if (res.ok) {
      setProfile(res.value);
      setMsg({ ok: true, text: "Spremljeno." });
    } else setMsg({ ok: false, text: res.error });
  }

  async function pick(color: string) {
    const res = await repo!.updateProfile({ avatar: { color } });
    if (res.ok) setProfile(res.value);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="tile px-4 py-4" aria-labelledby="profile-h">
      <h2 id="profile-h" className="label">
        Tvoj profil
      </h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar username={profile.username} avatar={profile.avatar} size={52} />
        <form onSubmit={save} className="flex min-w-0 flex-1 gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setMsg(null);
            }}
            aria-label="Korisničko ime"
            maxLength={16}
            autoCapitalize="none"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 outline-none focus:border-ink"
          />
          <button className="btn-secondary" disabled={name.trim().toLowerCase() === profile.username}>
            Spremi
          </button>
        </form>
      </div>
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-signal-dark" : "text-miss"}`} role="status">
          {msg.text}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Boja avatara">
        {AVATAR_KEYS.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={profile.avatar.color === k}
            aria-label={k}
            onClick={() => void pick(k)}
            className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-white ${profile.avatar.color === k ? "ring-2 ring-ink" : ""}`}
            style={{ background: AVATAR_COLORS[k] }}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-sm font-semibold">Pozovi prijatelje</p>
        <p className="text-sm text-muted">Podijeli korisničko ime ili ovaj link. Prijatelji ne moraju igrati u isto vrijeme.</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-full bg-soft px-4 py-2.5 text-sm" data-testid="invite-link">
            {link}
          </code>
          <button className="btn-secondary" onClick={copy} aria-label="Kopiraj link za poziv">
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? "Kopirano" : "Kopiraj"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function FriendsList() {
  const { repo, today, profile } = useGame();
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (repo) setFriends(await repo.listFriends(today));
  }, [repo, today]);

  useEffect(() => {
    void load();
  }, [load, profile?.id]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!repo) return;
    const res = await repo.addFriend(name, today);
    if (res.ok) {
      setMsg({ ok: true, text: `Dodan/a: ${res.value.username}.` });
      setName("");
      await load();
    } else setMsg({ ok: false, text: res.error });
  }

  async function remove(f: FriendEntry) {
    await repo?.removeFriend(f.userId);
    await load();
  }

  return (
    <section className="mt-6" aria-labelledby="friends-h">
      <h2 id="friends-h" className="text-xl font-bold">
        Prijatelji
      </h2>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMsg(null);
          }}
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
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-signal-dark" : "text-miss"}`} role="status" data-testid="friend-msg">
          {msg.text}
        </p>
      )}

      {friends === null ? null : friends.length === 0 ? (
        <p className="tile mt-4 px-4 py-6 text-center text-muted">Još nemaš prijatelja. Dodaj nekoga po korisničkom imenu ili mu pošalji link za poziv.</p>
      ) : (
        <ul className="tile mt-4 divide-y divide-line/70" data-testid="friends-list">
          {friends.map((f) => (
            <li key={f.userId} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar username={f.username} avatar={f.avatar} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.username}</p>
                <p className="text-xs text-muted">
                  Danas {f.todayPoints === null ? "još nije igrao/la" : `${f.todayPoints} bod.`} · Ukupno {f.totalPoints.toLocaleString("hr-HR")}
                </p>
              </div>
              <button onClick={() => void remove(f)} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink" aria-label={`Ukloni ${f.username}`}>
                <UserMinus size={17} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
