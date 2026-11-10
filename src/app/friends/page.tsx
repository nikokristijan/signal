"use client";

import { AuthGate } from "@/components/AuthGate";
import { FriendsList, ProfileCard } from "@/components/FriendsPanel";
import { useGame } from "@/components/GameProvider";
import { Loading, Page } from "@/components/Page";

export default function FriendsPage() {
  const { ready, profile, repo } = useGame();
  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;
  return (
    <Page>
      <h1 className="text-3xl font-extrabold tracking-tight">Friends &amp; profile</h1>
      <div className="mt-4">
        <ProfileCard />
      </div>
      <FriendsList />
      {repo?.auth && (
        <button className="mt-8 text-sm text-muted underline underline-offset-2" onClick={() => void repo.auth!.signOut().then(() => window.location.assign("/"))}>
          Sign out
        </button>
      )}
    </Page>
  );
}
