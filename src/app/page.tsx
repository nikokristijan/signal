"use client";

import Link from "next/link";
import { Clock, Flame, Star } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { useBomb } from "@/components/BombProvider";
import { Countdown } from "@/components/Countdown";
import { FriendsToday } from "@/components/FriendsToday";
import { Loading, Page } from "@/components/Page";

export default function HomePage() {
  const { ready, profile, number, daily, training, stats, trainingStats } = useBomb();

  if (!ready) return <Page><Loading /></Page>;
  if (!profile) return <Page><AuthGate /></Page>;

  const dailyPlaying = Boolean(daily?.playing);
  const dailyPlayed = (daily?.gamesToday ?? 0) > 0;
  const trainingPlaying = Boolean(training?.playing);

  return (
    <Page>
      <div className="text-center">
        <p className="label" data-testid="challenge-number">Izazov #{number}</p>
        <h1 className="mt-2 text-5xl font-extrabold leading-[1.05] tracking-tight">Dnevna bomba</h1>
        <p className="mt-3 text-lg text-muted">Upiši riječ sa slogom prije nego bomba eksplodira.</p>
      </div>

      <div className="mt-7 space-y-3">
        <section className="tile px-4 py-4" aria-labelledby="liga-dnevna" data-testid="league-daily-card">
          <div className="flex items-baseline justify-between">
            <h2 id="liga-dnevna" className="text-lg font-extrabold">Dnevna liga</h2>
            <span className="text-xs font-semibold text-muted">isti slogovi za sve</span>
          </div>
          <Link href="/igra" className="btn-primary btn-lg mt-3 w-full" data-testid="play">
            {dailyPlaying ? "Nastavi partiju" : dailyPlayed ? "Igraj ponovno" : "Igraj dnevni izazov"}
          </Link>
          <p className="mt-2 text-center text-sm text-muted" data-testid="today-best">
            {daily?.best ? (
              <>Najbolje danas: <strong className="text-ink">{daily.best.score}</strong> · {daily.gamesToday} {daily.gamesToday === 1 ? "partija" : "partija"}</>
            ) : (
              "Danas još nisi igrao. Novi niz slogova svaku ponoć."
            )}
          </p>
        </section>

        <section className="tile px-4 py-4" aria-labelledby="liga-trening" data-testid="league-training-card">
          <div className="flex items-baseline justify-between">
            <h2 id="liga-trening" className="text-lg font-extrabold">Trening liga</h2>
            <span className="text-xs font-semibold text-muted">novi slogovi svaki put</span>
          </div>
          <Link href="/trening" className="btn-ghost btn-lg mt-3 w-full" data-testid="training">
            {trainingPlaying ? "Nastavi trening" : "Igraj trening"}
          </Link>
          <p className="mt-2 text-center text-sm text-muted" data-testid="training-best">
            {trainingStats.played > 0 ? (
              <>High score: <strong className="text-ink">{trainingStats.bestScore}</strong> · {trainingStats.played} {trainingStats.played === 1 ? "partija" : "partija"}</>
            ) : (
              "Slobodna igra bez ograničenja. Natječi se s prijateljima."
            )}
          </p>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 text-center">
        <div className="tile px-3 py-3">
          <p className="label flex items-center justify-center gap-1"><Flame size={14} aria-hidden /> Niz dana</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid="streak">{stats.currentStreak}</p>
          <p className="text-xs text-muted">{stats.currentStreak === 1 ? "dan" : "dana"}</p>
        </div>
        <div className="tile px-3 py-3">
          <p className="label flex items-center justify-center gap-1"><Star size={14} aria-hidden /> High score</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid="best-score">{stats.bestScore}</p>
          <p className="text-xs text-muted">dnevna liga</p>
        </div>
      </div>

      <div className="mt-4"><FriendsToday /></div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted">
        <Clock size={15} aria-hidden /> Novi dnevni niz slogova za <Countdown className="font-bold text-ink" />
      </p>

      <details className="tile mt-6 px-4 py-3 text-sm text-muted" data-testid="rules">
        <summary className="cursor-pointer font-bold text-ink">Kako se igra</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Na bombi je slog (npr. <b className="text-ink">KRA</b>). Upiši riječ koja ga sadrži: kravata, ukrasti…</li>
          <li>Točna riječ: novi slog i tajmer se vraća. Tajmer kreće od 10 s i skraćuje se do 3 s.</li>
          <li>Istekne li, bomba eksplodira: gubiš život (kreneš s 2). Na 0 života partija završava, a onda možeš opet.</li>
          <li>Odgovor brži od 2 s daje combo i +1 s sljedećem tajmeru.</li>
          <li><b className="text-ink">Što je riječ duža, to više bodova:</b> vrijedi koliko je slova na kvadrat (kravata = 49, ukrasti = 64).</li>
          <li><b className="text-ink">Dnevna liga:</b> svi danas igraju isti niz slogova; igraj koliko god puta želiš, na ljestvici je tvoj najbolji rezultat.</li>
          <li><b className="text-ink">Trening liga:</b> svaka partija ima nove slogove i vlastitu ljestvicu s prijateljima. Ne utječe na niz dana.</li>
          <li>Dijakritici nisu obavezni: „kisobran" vrijedi za „kišobran".</li>
        </ul>
      </details>
    </Page>
  );
}
