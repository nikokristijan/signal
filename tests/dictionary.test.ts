import { describe, expect, it } from "vitest";
import { fold, normalizeInput } from "@/lib/dict/fold";
import { resolveWord } from "@/lib/dict/resolve";
import { dict } from "./helpers";

describe("normalizacija dijakritika", () => {
  it("fold zamjenjuje č ć š ž đ", () => {
    expect(fold("kišobran")).toBe("kisobran");
    expect(fold("ćevapčići")).toBe("cevapcici");
    expect(fold("đurđevak")).toBe("durdevak");
    expect(fold("žaba")).toBe("zaba");
  });
  it("normalizeInput: mala slova, trim, NFC", () => {
    expect(normalizeInput("  KRAvata ")).toBe("kravata");
    expect(normalizeInput("čevap")).toBe("čevap");
  });
});

describe("rječnik (svi oblici)", () => {
  it("sadrži oblike koje je igrač naveo kao primjer", () => {
    for (const w of ["ukrao", "kravatom", "kravata", "ukrasti", "kišobran", "neprobojnost", "ukrala", "ukradeno", "kravatama"]) {
      expect(dict.has(w), w).toBe(true);
    }
  });
  it("ne sadrži izmišljene riječi ni vlastita imena s velikim slovom", () => {
    expect(dict.has("qwertzuiop")).toBe(false);
    expect(dict.has("asdfgh")).toBe(false);
    expect(dict.has("Zagreb")).toBe(false);
  });
  it("ima više od milijun oblika", () => {
    expect(dict.size).toBeGreaterThan(1_000_000);
  });
  it("lookupFold vraća sve riječi s istim složenim oblikom", () => {
    const r = dict.lookupFold("kisobran");
    expect(r).toContain("kišobran");
  });
});

describe("resolveWord: pravila", () => {
  const none: string[] = [];
  it("točna riječ sa slogom", () => {
    expect(resolveWord(dict, "kravata", "kra", none)).toEqual({ ok: true, word: "kravata" });
    expect(resolveWord(dict, "ukrasti", "kra", none)).toEqual({ ok: true, word: "ukrasti" });
    expect(resolveWord(dict, "ukrao", "kra", none)).toEqual({ ok: true, word: "ukrao" });
    expect(resolveWord(dict, "KRAVATOM", "kra", none)).toEqual({ ok: true, word: "kravatom" });
  });
  it("bez dijakritika vrijedi: kisobran → kišobran", () => {
    expect(resolveWord(dict, "kisobran", "ša", none)).toEqual({ ok: false, reason: "no-syllable" }); // kišobran nema „ša"
    expect(resolveWord(dict, "kisobran", "šo", none)).toEqual({ ok: true, word: "kišobran" });
    expect(resolveWord(dict, "kisobran", "bra", none)).toEqual({ ok: true, word: "kišobran" });
    expect(resolveWord(dict, "kišobran", "šo", none)).toEqual({ ok: true, word: "kišobran" });
  });
  it("slog s dijakritikom traži točnu riječ: sat ne vrijedi za ŠA", () => {
    expect(resolveWord(dict, "sat", "ša", none)).toEqual({ ok: false, reason: "no-syllable" });
  });
  it("razlozi odbijanja", () => {
    expect(resolveWord(dict, "kravata", "bom", none)).toEqual({ ok: false, reason: "no-syllable" });
    expect(resolveWord(dict, "kraxyz", "kra", none)).toEqual({ ok: false, reason: "not-in-dictionary" });
    expect(resolveWord(dict, "", "kra", none)).toEqual({ ok: false, reason: "empty" });
    expect(resolveWord(dict, "kra5", "kra", none)).toEqual({ ok: false, reason: "not-in-dictionary" });
    expect(resolveWord(dict, "kravata", "kra", ["kravata"])).toEqual({ ok: false, reason: "used" });
  });
  it("ponavljanje se računa po kanonskom obliku: kisobran nakon kišobran je iskorišteno", () => {
    expect(resolveWord(dict, "kisobran", "bra", ["kišobran"])).toEqual({ ok: false, reason: "used" });
  });
});
