"use client";

import { AuthGate } from "@/components/AuthGate";
import { useBomb } from "@/components/BombProvider";
import { AccountCard, FriendsList, ProfileCard } from "@/components/FriendsPanel";
import { Loading, Page } from "@/components/Page";

export default function FriendsPage() {
  const { ready, profile } = useBomb();
  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;
  return (
    <Page>
      <h1 className="text-3xl font-extrabold tracking-tight">Prijatelji i profil</h1>
      <div className="mt-4"><ProfileCard /></div>
      <FriendsList />
      <AccountCard />
    </Page>
  );
}
