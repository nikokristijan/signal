"use client";

import Link from "next/link";
import { BarChart3, Trophy, Users } from "lucide-react";
import { Logo } from "./Logo";

const iconBtn = "grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised";

export function Header({ number }: { number?: number }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-xl grid-cols-[1fr_auto_1fr] items-center px-2">
        <nav className="flex justify-start" aria-label="Prijatelji">
          <Link href="/prijatelji" className={iconBtn} aria-label="Prijatelji i profil" title="Prijatelji">
            <Users size={22} strokeWidth={1.9} />
          </Link>
        </nav>
        <div className="flex flex-col items-center leading-none">
          <Logo className="text-[19px]" />
          {number !== undefined && <span className="mt-1 text-[11px] font-semibold tracking-wide text-muted">Izazov #{number}</span>}
        </div>
        <nav className="flex justify-end" aria-label="Statistika i ljestvica">
          <Link href="/statistika" className={iconBtn} aria-label="Statistika" title="Statistika">
            <BarChart3 size={22} strokeWidth={1.9} />
          </Link>
          <Link href="/ljestvica" className={iconBtn} aria-label="Ljestvica" title="Ljestvica">
            <Trophy size={22} strokeWidth={1.9} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
