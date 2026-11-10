import { describe, expect, it } from "vitest";
import { addDays, challengeNumber, dailySeed, formatCountdown, msUntilNextMidnight, weekStartKey, zagrebDateKey } from "@/lib/game/dates";
import { shareText, wordsLabel } from "@/lib/game/share";
import { computeStats, computeStreaks } from "@/lib/game/stats";
import type { GameResult } from "@/lib/game/types";

describe("datum u Zagrebu (granica je zagrebačka ponoć)", () => {
  it("zimi (CET, UTC+1)", () => {
    expect(zagrebDateKey(new Date("2026-11-10T22:59:59Z"))).toBe("2026-11-10");
    expect(zagrebDateKey(new Date("2026-11-10T23:00:00Z"))).toBe("2026-11-11");
  });
  it("ljeti (CEST, UTC+2)", () => {
    expect(zagrebDateKey(new Date("2026-07-10T21:59:59Z"))).toBe("2026-07-10");
    expect(zagrebDateKey(new Date("2026-07-10T22:00:00Z"))).toBe("2026-07-11");
  });
  it("broj izazova: dani od lansiranja + 1 (10. 11. 2026. je #12)", () => {
    expect(challengeNumber("2026-10-30")).toBe(1);
    expect(challengeNumber("2026-11-10")).toBe(12);
    expect(dailySeed("2026-11-10")).toBe("bomba:2026-11-10");
  });
  it("addDays i početak tjedna (ponedjeljak)", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekStartKey("2026-11-10")).toBe("2026-11-09");
    expect(weekStartKey("2026-11-08")).toBe("2026-11-02");
  });
});

describe("odbrojavanje do ponoći", () => {
  const near = (v: number, target: number) => expect(Math.abs(v - target)).toBeLessThanOrEqual(260);
  it("minutu prije ponoći", () => near(msUntilNextMidnight(new Date("2026-11-10T22:59:00Z")), 60_000));
  it("točno na ponoć počinje cijeli novi dan", () => near(msUntilNextMidnight(new Date("2026-11-10T23:00:00Z")), 24 * 3_600_000));
  it("na dan prelaska na ljetno računanje dan ima 23 h", () => near(msUntilNextMidnight(new Date("2026-03-28T23:00:00Z")), 23 * 3_600_000));
  it("na dan prelaska na zimsko računanje dan ima 25 h", () => near(msUntilNextMidnight(new Date("2026-10-24T22:00:00Z")), 25 * 3_600_000));
  it("formatira HH:MM:SS", () => {
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
    expect(formatCountdown(0)).toBe("00:00:00");
  });
});

describe("dijeljenje", () => {
  it("tekst odgovara zadanom formatu", () => {
    expect(shareText({ number: 12, words: 34, score: 512, maxCombo: 7, longest: "neprobojnost" }, "https://bomba.example")).toBe(
      "💣 Bomba #12 · 34 riječi · 512 bodova\n🔥 combo ×7 · najduža: „neprobojnost\"\nhttps://bomba.example",
    );
  });
  it("množina: 1 riječ, 2 riječi, 11 riječi, 21 riječ", () => {
    expect([1, 2, 5, 11, 21, 22].map(wordsLabel)).toEqual(["riječ", "riječi", "riječi", "riječi", "riječ", "riječi"]);
  });
  it("bez comboa i najduže riječi ne ispisuje drugi red", () => {
    expect(shareText({ number: 1, words: 0, score: 0, maxCombo: 0, longest: "" })).toBe("💣 Bomba #1 · 0 riječi · 0 bodova");
  });
});

describe("statistika i niz dana", () => {
  const r = (date: string, score: number, words = 10): GameResult => ({
    mode: "daily", date, number: 1, score, words, maxCombo: 2, longest: "riječ", wordList: [], booms: 2, durationMs: 1000, finishedAt: "",
  });
  it("niz živi ako danas još nije odigrano, a puca nakon propuštenog dana", () => {
    expect(computeStreaks(["2026-11-08", "2026-11-09"], "2026-11-10")).toEqual({ current: 2, longest: 2 });
    expect(computeStreaks(["2026-11-08", "2026-11-09", "2026-11-10"], "2026-11-10").current).toBe(3);
    expect(computeStreaks(["2026-11-05", "2026-11-06"], "2026-11-10").current).toBe(0);
    expect(computeStreaks(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-09"], "2026-11-10")).toEqual({ current: 1, longest: 3 });
  });
  it("najbolji rezultat, prosjek, odigrano", () => {
    const s = computeStats([r("2026-11-08", 300), r("2026-11-09", 500), r("2026-11-10", 100)], "2026-11-10");
    expect(s.bestScore).toBe(500);
    expect(s.averageScore).toBe(300);
    expect(s.played).toBe(3);
    expect(s.currentStreak).toBe(3);
  });
});
