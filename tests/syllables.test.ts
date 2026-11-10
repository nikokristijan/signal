import { describe, expect, it } from "vitest";
import data from "@/lib/data/slogovi.json";
import stats from "@/lib/data/slogovi-statistika.json";
import { hashSeed, mulberry32 } from "@/lib/game/rng";
import { generateSyllables, syllableAt, tierWeights } from "@/lib/game/syllables";

describe("PRNG", () => {
  it("isti seed daje isti niz, različit seed različit", () => {
    const a = mulberry32(hashSeed("bomba:2026-11-10"));
    const b = mulberry32(hashSeed("bomba:2026-11-10"));
    const c = mulberry32(hashSeed("bomba:2026-11-11"));
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    expect(xs).not.toEqual(Array.from({ length: 5 }, () => c()));
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThan(1);
  });
});

describe("generator slogova", () => {
  it("je deterministički: isti seed → isti niz", () => {
    expect(generateSyllables("bomba:2026-11-10", 60)).toEqual(generateSyllables("bomba:2026-11-10", 60));
  });
  it("različiti dani daju različite nizove", () => {
    expect(generateSyllables("bomba:2026-11-10", 30)).not.toEqual(generateSyllables("bomba:2026-11-11", 30));
  });
  it("je prefiksno stabilan i neovisan o redoslijedu traženja", () => {
    const long = generateSyllables("bomba:test-a", 100);
    expect(generateSyllables("bomba:test-b", 10)).toEqual(generateSyllables("bomba:test-b", 200).slice(0, 10));
    expect(syllableAt("bomba:test-a", 57)).toBe(long[57]);
    expect(syllableAt("bomba:test-c", 5)).toBe(generateSyllables("bomba:test-c", 6)[5]);
  });
  it("daje fiksan niz za poznati dan (regresija: ako ovo padne, promijenio se niz svima)", () => {
    expect(generateSyllables("bomba:2026-11-10", 5)).toMatchInlineSnapshot(`
      [
        "ali",
        "elo",
        "ala",
        "nji",
        "uće",
      ]
    `);
  });
  it("slogovi imaju 2–3 slova i samo slova hrvatske abecede bez q,w,x,y", () => {
    for (const s of generateSyllables("bomba:abc", 300)) {
      expect(s).toMatch(/^[abcčćdđefghijklmnoprsštuvzž]{2,3}$/);
    }
  });
  it("nema ponavljanja istog sloga unutar zadnjih 12", () => {
    const seq = generateSyllables("bomba:rep", 400);
    for (let i = 0; i < seq.length; i++) for (let j = Math.max(0, i - 12); j < i; j++) expect(seq[i]).not.toBe(seq[j]);
  });
  it("težina raste kroz partiju: prvih 5 slogova su laki, kasniji rjeđi", () => {
    const easy = new Set(data.slogovi.lako);
    for (let d = 1; d <= 20; d++) {
      for (const s of generateSyllables(`bomba:2026-11-${String(d).padStart(2, "0")}`, 5)) expect(easy.has(s)).toBe(true);
    }
    const korijeni = stats.korijeni as Record<string, number>;
    const avg = (from: number, to: number) => {
      let sum = 0;
      let n = 0;
      for (let d = 1; d <= 60; d++) {
        const seq = generateSyllables(`bomba:avg-${d}`, to);
        for (const s of seq.slice(from, to)) (sum += Math.log(korijeni[s])), n++;
      }
      return sum / n;
    };
    expect(avg(0, 5)).toBeGreaterThan(avg(10, 20));
    expect(avg(10, 20)).toBeGreaterThan(avg(40, 80));
    expect(tierWeights(0)[0]).toBe(1);
    expect(tierWeights(100)[2]).toBeGreaterThan(tierWeights(10)[2]);
  });
  it("svaki slog u skupu je rješiv (dovoljno korijena riječi)", () => {
    const korijeni = stats.korijeni as Record<string, number>;
    for (const tier of Object.values(data.slogovi)) for (const s of tier) expect(korijeni[s]).toBeGreaterThanOrEqual(data.pragovi.minKorijena);
  });
});
