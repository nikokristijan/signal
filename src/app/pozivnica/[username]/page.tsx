"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useBomb } from "@/components/BombProvider";
import { Loading, Page } from "@/components/Page";

export default function InvitePage() {
  const { username } = useParams<{ username: string }>();
  const { ready, repo, profile, today } = useBomb();
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!ready || !repo || !profile || done.current) return;
    done.current = true;
    void repo.addFriend(decodeURIComponent(username), today).then((r) => {
      setState(r.ok ? { ok: true, text: `Ti i ${r.value.username} ste sada prijatelji.` } : { ok: false, text: r.error });
    });
  }, [ready, repo, profile, username, today]);

  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;

  return (
    <Page>
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Pozivnica</h1>
        {state === null ? <Loading /> : (
          <p className={`mt-4 ${state.ok ? "text-signal-dark" : "text-danger"}`} role="status" data-testid="invite-result">{state.text}</p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/igra" className="btn-primary">Igraj dnevni izazov</Link>
          <Link href="/ljestvica" className="btn-ghost">Ljestvica prijatelja</Link>
        </div>
      </div>
    </Page>
  );
}
