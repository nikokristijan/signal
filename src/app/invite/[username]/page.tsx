"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useGame } from "@/components/GameProvider";
import { Loading, Page } from "@/components/Page";

export default function InvitePage() {
  const { username } = useParams<{ username: string }>();
  const { ready, repo, profile, today } = useGame();
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!ready || !repo || !profile || done.current) return;
    done.current = true;
    void repo.addFriend(decodeURIComponent(username), today).then((res) => {
      setState(res.ok ? { ok: true, text: `Ti i ${res.value.username} sada ste prijatelji.` } : { ok: false, text: res.error });
    });
  }, [ready, repo, profile, username, today]);

  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;

  return (
    <Page>
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Poziv za prijateljstvo</h1>
        {state === null ? (
          <Loading />
        ) : (
          <p className={`mt-4 ${state.ok ? "text-signal-dark" : "text-miss"}`} role="status" data-testid="invite-result">
            {state.text}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/play" className="btn-primary">Igraj današnji izazov</Link>
          <Link href="/leaderboard" className="btn-secondary">Ljestvica prijatelja</Link>
        </div>
      </div>
    </Page>
  );
}
