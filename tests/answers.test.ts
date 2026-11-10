import { describe, expect, it } from "vitest";
import { judgeGuess, matches, normalize } from "@/lib/game/answers";

const key = { answer: "Eiffel Tower", alternatives: ["Tour Eiffel", "Eiffel"], nudges: ["tower"] };

describe("answer matching", () => {
  it("normalizes case, accents, punctuation, articles and plurals", () => {
    expect(normalize("  The  Eiffel-Tower! ")).toBe("eiffel tower");
    expect(normalize("Rubik's Cube")).toBe(normalize("rubiks cube"));
    expect(normalize("Zebras")).toBe(normalize("zebra"));
    expect(normalize("Café")).toBe("cafe");
  });

  it("accepts the answer, alternatives and small typos", () => {
    expect(judgeGuess("eiffel tower", key)).toBe("correct");
    expect(judgeGuess("The Eiffel Tower", key)).toBe("correct");
    expect(judgeGuess("tour eiffel", key)).toBe("correct");
    expect(judgeGuess("eifel tower", key)).toBe("correct"); // one typo
  });

  it("rejects wrong answers and flags generic ones as close", () => {
    expect(judgeGuess("big ben", key)).toBe("wrong");
    expect(judgeGuess("tower", key)).toBe("close");
    expect(judgeGuess("   ", key)).toBe("empty");
  });

  it("does not forgive typos in short words", () => {
    expect(matches("zebro", "Zebra")).toBe(false);
    expect(matches("pizzo", "Pizza")).toBe(false);
  });
});
