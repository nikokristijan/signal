"use client";

import { useEffect, useState } from "react";
import { formatCountdown, msUntilNextMidnight } from "@/lib/game/dates";
import { useGame } from "./GameProvider";

/** Counts down to the next local midnight and rolls the game over to the new day when it hits zero. */
export function Countdown({ className = "" }: { className?: string }) {
  const { rollover } = useGame();
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    let last = msUntilNextMidnight();
    setMs(last);
    const id = window.setInterval(() => {
      const next = msUntilNextMidnight();
      setMs(next);
      if (next > last + 1000) rollover(); // wrapped past midnight
      last = next;
    }, 1000);
    return () => window.clearInterval(id);
  }, [rollover]);

  return (
    <span className={`tabular-nums ${className}`} aria-label="Time until the next challenge">
      {ms === null ? "--:--:--" : formatCountdown(ms)}
    </span>
  );
}
