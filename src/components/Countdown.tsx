"use client";

import { useEffect, useState } from "react";
import { formatCountdown, msUntilNextMidnight, zagrebDateKey } from "@/lib/game/dates";
import { useBomb } from "./BombProvider";

/** Odbrojava do sljedeće ponoći u Zagrebu; u ponoć učitava novi dan. */
export function Countdown({ className = "" }: { className?: string }) {
  const { rollover } = useBomb();
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    let day = zagrebDateKey();
    setMs(msUntilNextMidnight());
    const id = window.setInterval(() => {
      setMs(msUntilNextMidnight());
      const now = zagrebDateKey();
      if (now !== day) {
        day = now;
        rollover();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [rollover]);

  return (
    <span className={`tabular-nums ${className}`} aria-label="Vrijeme do sljedećeg izazova">
      {ms === null ? "--:--:--" : formatCountdown(ms)}
    </span>
  );
}
