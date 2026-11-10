"use client";

import type { Mode } from "@/lib/game/constants";
import { LEAGUE_NAME } from "@/lib/game/seeds";

/** Prekidač između dnevne i trening lige (ljestvica, statistika). */
export function LeagueToggle({ value, onChange }: { value: Mode; onChange(m: Mode): void }) {
  return (
    <div role="tablist" aria-label="Liga" className="grid grid-cols-2 gap-1 rounded-full border border-line bg-raised p-1" data-testid="league-toggle">
      {(["daily", "training"] as const).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={value === m}
          data-testid={`league-${m}`}
          onClick={() => onChange(m)}
          className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${value === m ? "bg-white shadow-sm" : "text-muted hover:text-ink"}`}
        >
          {LEAGUE_NAME[m]}
        </button>
      ))}
    </div>
  );
}
