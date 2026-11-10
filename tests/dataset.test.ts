import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matches, normalize } from "@/lib/game/answers";
import { CHALLENGE_DEFS, allChallenges, getChallengeForDate } from "@/lib/data/challenges";
import { contains, stageRects } from "../scripts/crop.mjs";

const all = allChallenges();

describe("challenge dataset", () => {
  it("has at least 30 curated challenges with unique ids, dates, slugs", () => {
    expect(all.length).toBeGreaterThanOrEqual(30);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.date)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.slug)).size).toBe(all.length);
  });

  it("has every required field and exactly five stages per challenge", () => {
    for (const c of all) {
      expect(c.subject, c.slug).toBeTruthy();
      expect(c.answer, c.slug).toBeTruthy();
      expect(c.alternatives.length, c.slug).toBeGreaterThan(0);
      expect(["easy", "medium", "hard"]).toContain(c.difficulty);
      expect(c.category, c.slug).toBeTruthy();
      expect(c.stages, c.slug).toHaveLength(5);
      expect(c.credit?.author, `${c.slug} credit`).toBeTruthy();
      expect(c.credit?.license, `${c.slug} license`).toBeTruthy();
    }
  });

  it("covers a wide range of categories", () => {
    expect(new Set(CHALLENGE_DEFS.map((d) => d.category)).size).toBeGreaterThanOrEqual(7);
  });

  it("is unambiguous: no answer (typo-tolerant) matches a different challenge", () => {
    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        for (const cand of [b.answer, ...b.alternatives]) {
          for (const guess of [a.answer, ...a.alternatives]) {
            expect(matches(guess, cand), `"${guess}" (${a.slug}) must not match "${cand}" (${b.slug})`).toBe(false);
          }
        }
      }
    }
  });

  it("never leaks the answer through a nudge, and nudges are not accepted answers", () => {
    for (const c of all) {
      for (const n of c.nudges) {
        for (const ok of [c.answer, ...c.alternatives]) expect(normalize(n), `${c.slug}: nudge "${n}"`).not.toBe(normalize(ok));
      }
    }
  });

  it("maps every calendar day to a challenge, cycling after the dataset", () => {
    expect(getChallengeForDate(all[0].date).slug).toBe(all[0].slug);
    const after = new Date(all[all.length - 1].date + "T12:00:00");
    after.setDate(after.getDate() + 1);
    const key = `${after.getFullYear()}-${String(after.getMonth() + 1).padStart(2, "0")}-${String(after.getDate()).padStart(2, "0")}`;
    expect(getChallengeForDate(key).slug).toBe(all[0].slug);
  });
});

describe("zoom stages", () => {
  it("are nested crops of the same master photo, getting steadily wider", () => {
    for (const d of CHALLENGE_DEFS) {
      const rects = stageRects(d.focus, d.zooms);
      expect(rects).toHaveLength(5);
      for (let i = 0; i < 4; i++) {
        expect(contains(rects[i + 1], rects[i]), `${d.slug}: stage ${i + 1} inside stage ${i + 2}`).toBe(true);
        expect(rects[i].w, `${d.slug}: stage ${i + 1} narrower`).toBeLessThan(rects[i + 1].w);
      }
      expect(rects[4]).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    }
  });

  it("have image files on disk for every stage", () => {
    for (const d of CHALLENGE_DEFS) {
      for (let s = 1; s <= 5; s++) {
        const f = path.join(__dirname, "../public/challenges", d.slug, `stage-${s}.webp`);
        expect(fs.existsSync(f), f).toBe(true);
      }
    }
  });
});
