import { describe, expect, it } from "vitest";
import { applyGiveUp, applyGuess, applyReveal } from "@/lib/game/engine";
import { STAGE_POINTS, currentScore, newAttempt, stagePoints } from "@/lib/game/scoring";

const key = { answer: "Giraffe", alternatives: ["Giraffes"], nudges: ["animal"] };
const challenge = { id: "sig-001", date: "2026-11-10", number: 1 };

describe("scoring", () => {
  it("awards 500/400/300/200/100 by stage", () => {
    expect([1, 2, 3, 4, 5].map(stagePoints)).toEqual([...STAGE_POINTS]);
  });

  it("subtracts 50 per wrong guess and never goes below zero", () => {
    expect(currentScore(1, 2)).toBe(400);
    expect(currentScore(5, 1)).toBe(50);
    expect(currentScore(5, 2)).toBe(0);
    expect(currentScore(5, 10)).toBe(0);
  });
});

describe("attempt engine", () => {
  it("wrong guess costs 50 and keeps the stage", () => {
    const a = newAttempt(challenge);
    const out = applyGuess(a, key, "zebra");
    expect(out.verdict).toBe("wrong");
    expect(out.penalty).toBe(50);
    expect(out.attempt.score).toBe(450);
    expect(out.attempt.stage).toBe(1);
    expect(out.attempt.status).toBe("playing");
  });

  it("repeating a wrong guess or a nudge costs nothing", () => {
    let a = applyGuess(newAttempt(challenge), key, "zebra").attempt;
    const again = applyGuess(a, key, "Zebra");
    expect(again.verdict).toBe("duplicate");
    expect(again.attempt.score).toBe(450);
    const nudge = applyGuess(a, key, "animal");
    expect(nudge.verdict).toBe("close");
    expect(nudge.attempt.score).toBe(450);
    a = nudge.attempt;
    expect(a.wrongCount).toBe(1);
  });

  it("reveal lowers the potential points; correct answer at stage 3 after one miss = 250", () => {
    let a = newAttempt(challenge);
    a = applyGuess(a, key, "horse").attempt;
    a = applyReveal(a);
    a = applyReveal(a);
    expect(a.stage).toBe(3);
    expect(a.score).toBe(250);
    const done = applyGuess(a, key, "giraffe");
    expect(done.verdict).toBe("correct");
    expect(done.attempt.status).toBe("solved");
    expect(done.attempt.solvedStage).toBe(3);
    expect(done.attempt.score).toBe(250);
    expect(done.attempt.finishedAt).not.toBeNull();
  });

  it("cannot reveal past stage 5 and cannot play after finishing", () => {
    let a = newAttempt(challenge);
    for (let i = 0; i < 8; i++) a = applyReveal(a);
    expect(a.stage).toBe(5);
    const done = applyGuess(a, key, "giraffe").attempt;
    expect(done.score).toBe(100);
    expect(applyReveal(done)).toBe(done);
    expect(applyGuess(done, key, "zebra").attempt).toBe(done);
  });

  it("giving up scores zero and shows the full image", () => {
    const a = applyGiveUp(newAttempt(challenge));
    expect(a.status).toBe("gave_up");
    expect(a.score).toBe(0);
    expect(a.stage).toBe(5);
  });
});
