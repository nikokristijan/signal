import { describe, expect, it } from "vitest";
import { addDays, formatCountdown, localDateKey, monthStartKey, msUntilNextMidnight, weekStartKey } from "@/lib/game/dates";
import { computeStats, computeStreaks } from "@/lib/game/stats";
import type { Attempt } from "@/lib/game/types";

const att = (date: string, status: Attempt["status"], score: number, solvedStage: number | null): Attempt => ({
  challengeId: `c-${date}`, date, number: 1, stage: solvedStage ?? 5, guesses: [], wrongCount: 0, status, score, solvedStage,
  startedAt: "", finishedAt: status === "playing" ? null : "x",
});

describe("dates", () => {
  it("handles local date keys, week and month boundaries", () => {
    expect(localDateKey(new Date(2026, 10, 10, 23, 59))).toBe("2026-11-10");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(weekStartKey("2026-11-10")).toBe("2026-11-09"); // Tuesday → Monday
    expect(weekStartKey("2026-11-08")).toBe("2026-11-02"); // Sunday → previous Monday
    expect(monthStartKey("2026-11-10")).toBe("2026-11-01");
  });

  it("counts down to the next local midnight", () => {
    expect(msUntilNextMidnight(new Date(2026, 10, 10, 23, 59, 0))).toBe(60_000);
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
  });
});

describe("stats", () => {
  const today = "2026-11-10";
  it("computes streaks, alive until today ends", () => {
    const a = [att("2026-11-07", "solved", 300, 3), att("2026-11-08", "solved", 400, 2), att("2026-11-09", "solved", 500, 1)];
    expect(computeStreaks(a, today)).toEqual({ current: 3, longest: 3 });
    expect(computeStreaks([...a, att(today, "solved", 100, 5)], today).current).toBe(4);
  });

  it("giving up or skipping a day breaks the streak", () => {
    const a = [att("2026-11-07", "solved", 300, 3), att("2026-11-08", "gave_up", 0, null), att("2026-11-09", "solved", 500, 1)];
    expect(computeStreaks(a, today)).toEqual({ current: 1, longest: 1 });
    expect(computeStreaks([att("2026-11-05", "solved", 1, 1)], today).current).toBe(0);
  });

  it("aggregates totals, averages and percentages", () => {
    const s = computeStats([att("2026-11-08", "solved", 400, 2), att("2026-11-09", "solved", 200, 4), att("2026-11-10", "gave_up", 0, null)], today);
    expect(s.totalPoints).toBe(600);
    expect(s.averageStage).toBe(3);
    expect(s.correctPercent).toBe(67);
    expect(s.bestScore).toBe(400);
    expect(s.completed).toBe(3);
    expect(s.stageDistribution).toEqual([0, 1, 0, 1, 0]);
  });

  it("is sane with no data", () => {
    const s = computeStats([], today);
    expect(s.averageStage).toBeNull();
    expect(s.correctPercent).toBe(0);
  });
});
