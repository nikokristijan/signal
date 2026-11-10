import { Check } from "lucide-react";
import type { Ghost } from "@/lib/game/types";
import { Avatar } from "./Avatar";

const nextTen = (n: number) => Math.ceil(n / 10) * 10;

/**
 * Natjecanje s prijateljima, bez gužve: jedan red teksta o SLJEDEĆEM prijatelju koji se može prestići
 * i tanka traka s malim točkama za sve prijatelje koji su danas igrali (točka = gdje su pali).
 */
export function GhostBar({ words, ghosts }: { words: number; ghosts: Ghost[] }) {
  if (ghosts.length === 0) return null;
  const maxGhost = ghosts.reduce((m, g) => Math.max(m, g.words), 0);
  const scale = Math.max(20, nextTen(Math.max(maxGhost, words) * 1.1));
  const pct = (n: number) => Math.min(100, (n / scale) * 100);
  const ahead = ghosts.filter((g) => g.words >= words).sort((a, b) => a.words - b.words);
  const next = ahead[0];
  const passedAll = !next;

  return (
    <div className="px-5 pt-3" data-testid="ghostbar" aria-label="Napredak u odnosu na prijatelje">
      <div className="flex h-6 items-center justify-between text-[13px]" data-testid="ghost-next">
        {passedAll ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-signal-dark">
            <Check size={15} aria-hidden /> Ispred si svih prijatelja
          </span>
        ) : (
          <>
            <span className="inline-flex min-w-0 items-center gap-2 text-muted">
              <Avatar username={next.username} avatar={next.avatar} size={20} />
              <span className="truncate">
                Sljedeći: <b className="font-semibold text-ink">{next.username}</b> · {next.words}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">još {next.words - words + 1}</span>
          </>
        )}
      </div>

      <div className="relative mt-2 h-1.5 rounded-full bg-raised">
        <div className="absolute inset-y-0 left-0 rounded-full bg-signal transition-[width] duration-700 ease-out" style={{ width: `${pct(words)}%` }} />
        {ghosts.map((g) => {
          const passed = words > g.words;
          return (
            <span
              key={g.userId}
              data-testid="ghost"
              data-passed={passed ? "true" : undefined}
              title={`${g.username} · ${g.words}`}
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper transition-colors duration-700 ${passed ? "bg-line" : "bg-ink"}`}
              style={{ left: `${pct(g.words)}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
