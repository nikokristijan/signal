"use client";

import Link from "next/link";
import { BarChart3, Trophy, Users } from "lucide-react";
import { Logo } from "./Logo";

const iconBtn = "grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-soft";

export function Header({ challengeNumber }: { challengeNumber?: number }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-xl grid-cols-[1fr_auto_1fr] items-center px-2">
        <nav className="flex justify-start" aria-label="Friends">
          <Link href="/friends" className={iconBtn} aria-label="Friends and profile" title="Friends">
            <Users size={22} strokeWidth={1.8} />
          </Link>
        </nav>
        <div className="flex flex-col items-center leading-none">
          <Logo className="text-[22px]" />
          {challengeNumber !== undefined && <span className="mt-1 text-[11px] font-medium tracking-wide text-muted">No. {challengeNumber}</span>}
        </div>
        <nav className="flex justify-end" aria-label="Stats and leaderboard">
          <Link href="/stats" className={iconBtn} aria-label="Statistics" title="Statistics">
            <BarChart3 size={22} strokeWidth={1.8} />
          </Link>
          <Link href="/leaderboard" className={iconBtn} aria-label="Leaderboard" title="Leaderboard">
            <Trophy size={22} strokeWidth={1.8} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
