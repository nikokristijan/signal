"use client";

import Link from "next/link";
import { Clock, Flame, Star } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { useBomb } from "@/components/BombProvider";
import { Countdown } from "@/components/Countdown";
import { FriendsToday } from "@/components/FriendsToday";
import { Loading, Page } from "@/components/Page";

export default function HomePage() {
  const { ready, profile, number, daily, stats } = useBomb();

  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;

  const finished = daily?.state === "finished";
  const playing = daily?.state === "playing";

  return (
    <Page>
      <div className="text-center">
        <p className="label" data-testid="challenge-number">Izazov #{number}</p>
        <h1 className="mt-2 text-5xl font-extrabold leading-[1.05] tracking-tight">Dnevna bomba</h1>
        <p className="mt-3 text-lg text-muted">Upiši riječ sa slogom prije nego bomba eksplodira.</p>

        <Link href="/igra" className="btn-primary btn-lg mt-7 w-full sm:w-auto" data-testid="play">
          {finished ? "Vidi današnji rezultat" : playing ? "Nastavi partiju" : "Igraj dnevni izazov"}
        </Link>
        {finished && daily?.result && (
          <p className="mt-3 text-sm text-muted">
            Danas: <strong className="text-ink">{daily.result.score}</strong> bodova, {daily.result.words} riječi. Vidimo se sutra!
          </p>
        )}
        <div className="mt-3">
          <Link href="/trening" className="text-sm font-semibold text-muted underline underline-offset-4 hover:text-ink" data-testid="training">
            Trening (neograničeno, bez ljestvice)
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 text-center">
        <div className="tile px-3 py-3">
          <p className="label flex items-center justify-center gap-1"><Flame size={14} aria-hidden /> Niz dana</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid="streak">{stats.currentStreak}</p>
          <p className="text-xs text-muted">{stats.currentStreak === 1 ? "dan" : "dana"}</p>
        </div>
        <div className="tile px-3 py-3">
          <p className="label flex items-center justify-center gap-1"><Star size={14} aria-hidden /> Najbolji</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid="best-score">{stats.bestScore}</p>
          <p className="text-xs text-muted">bodova</p>
        </div>
      </div>

      <div className="mt-4"><FriendsToday /></div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted">
        <Clock size={15} aria-hidden /> {finished ? "Sljedeći izazov za" : "Novi izazov za"} <Countdown className="font-bold text-ink" />
      </p>

      <details className="tile mt-6 px-4 py-3 text-sm text-muted" data-testid="rules">
        <summary className="cursor-pointer font-bold text-ink">Kako se igra</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Na bombi je slog (npr. <b className="text-ink">KRA</b>). Upiši riječ koja ga sadrži: kravata, ukrasti…</li>
          <li>Točna riječ: novi slog i tajmer se vraća. Tajmer kreće od 10 s i skraćuje se do 3 s.</li>
          <li>Istekne li, bomba eksplodira: gubiš život (kreneš s 2). Na 0 života partija završava.</li>
          <li>Odgovor brži od 2 s daje combo i +1 s sljedećem tajmeru.</li>
          <li><b className="text-ink">Što je riječ duža, to više bodova:</b> vrijedi koliko je slova na kvadrat (kravata = 49, ukrasti = 64).</li>
          <li>Dijakritici nisu obavezni: „kisobran" vrijedi za „kišobran".</li>
        </ul>
      </details>
    </Page>
  );
}
