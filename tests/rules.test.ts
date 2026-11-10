import { describe, expect, it } from "vitest";
import { FAST_MS, START_LIVES } from "@/lib/game/constants";
import { applyBoom, applyWord, initialState, timeLimitMs, wordPoints } from "@/lib/game/rules";

describe("tajmer", () => {
  it("počinje na 10 s, skraćuje se za 0,25 s po točnoj riječi, najmanje 3 s", () => {
    expect(timeLimitMs({ successes: 0, lastFast: false })).toBe(10_000);
    expect(timeLimitMs({ successes: 1, lastFast: false })).toBe(9_750);
    expect(timeLimitMs({ successes: 4, lastFast: false })).toBe(9_000);
    expect(timeLimitMs({ successes: 28, lastFast: false })).toBe(3_000);
    expect(timeLimitMs({ successes: 500, lastFast: false })).toBe(3_000);
  });
  it("brz odgovor daje +1 s sljedećem tajmeru", () => {
    expect(timeLimitMs({ successes: 1, lastFast: true })).toBe(10_750);
    expect(timeLimitMs({ successes: 500, lastFast: true })).toBe(4_000);
  });
});

describe("bodovanje: što je riječ duža, to više vrijedi", () => {
  it("riječ vrijedi koliko je slova na kvadrat", () => {
    expect(wordPoints(3, 0, false).total).toBe(9);
    expect(wordPoints(5, 0, false).total).toBe(25);
    expect(wordPoints(7, 0, false).total).toBe(49); // kravata
    expect(wordPoints(8, 0, false).total).toBe(64); // ukrasti
    expect(wordPoints(12, 0, false).total).toBe(144); // neprobojnost
  });
  it("dulja riječ UVIJEK vrijedi više od kraće (bez comboa)", () => {
    for (let n = 3; n < 24; n++) expect(wordPoints(n + 1, 0, false).total).toBeGreaterThan(wordPoints(n, 0, false).total);
  });
  it("duga spora riječ nosi više od kratke brze (duljina je važnija od brzine)", () => {
    expect(wordPoints(10, 0, false).total).toBeGreaterThan(wordPoints(5, 15, true).total); // 100 > 25 + 30
  });
  it("brz odgovor (< 2 s) povećava combo i daje bonus; spor ga resetira", () => {
    let s = initialState();
    s = applyWord(s, "kra", "kravata", 1000).state; // combo 1: 49 + 2
    expect(s.combo).toBe(1);
    expect(s.score).toBe(49 + 2);
    s = applyWord(s, "ukr", "ukrasti", 1999).state; // combo 2: 49 + 4
    expect(s.combo).toBe(2);
    expect(s.score).toBe(51 + 53);
    expect(s.lastFast).toBe(true);
    s = applyWord(s, "nje", "kretanje", FAST_MS).state; // točno 2 s nije brzo: samo 64
    expect(s.combo).toBe(0);
    expect(s.lastFast).toBe(false);
    expect(s.score).toBe(104 + 64);
    expect(s.maxCombo).toBe(2);
  });
  it("bonus za combo ima gornju granicu", () => {
    expect(wordPoints(4, 15, true).combo).toBe(30);
    expect(wordPoints(4, 40, true).combo).toBe(30);
  });
  it("najduža riječ se prati", () => {
    let s = initialState();
    s = applyWord(s, "a", "kratka", 3000).state;
    s = applyWord(s, "a", "najduljariječ", 3000).state;
    s = applyWord(s, "a", "srednja", 3000).state;
    expect(s.longest).toBe("najduljariječ");
  });
});

describe("životi i eksplozija", () => {
  it("kreće s 2 života; eksplozija oduzima život, resetira combo, ide na sljedeći slog", () => {
    let s = initialState();
    expect(s.lives).toBe(2);
    s = applyWord(s, "kra", "kravata", 500).state;
    s = applyBoom(s);
    expect(s.lives).toBe(1);
    expect(s.combo).toBe(0);
    expect(s.lastFast).toBe(false);
    expect(s.step).toBe(2);
    expect(s.over).toBe(false);
    s = applyBoom(s);
    expect(s.lives).toBe(0);
    expect(s.over).toBe(true);
  });
  it("nema bonus života: život se ne može dobiti natrag", () => {
    let s = initialState();
    for (const w of ["abcčćdđ", "efghijk", "lmnoprs", "štuvzžabeceda"]) s = applyWord(s, "a", w, 3000).state;
    expect(s.lives).toBe(START_LIVES);
  });
});
