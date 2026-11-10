import { describe, expect, it } from "vitest";
import { applyWord, initialState, timeLimitMs } from "@/lib/game/rules";
import { checkElapsed, minTypingMs, replayLog } from "@/lib/game/replay";
import { syllableAt } from "@/lib/game/syllables";
import type { LogEntry } from "@/lib/game/types";
import { allWords, dict, playLog, wordFor } from "./helpers";

const SEED = "bomba:2026-11-10";

describe("server replay: valjana partija", () => {
  it("prihvaća pošten zapis i SAM računa bodove", () => {
    const { log, state } = playLog(SEED, 12);
    const r = replayLog(SEED, log, dict);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.summary.score).toBe(state.score);
    expect(r.value.summary.words).toBe(12);
    expect(r.value.summary.booms).toBe(2);
    expect(r.value.summary.wordList).toHaveLength(12);
    expect(r.value.state.over).toBe(true);
  });

  it("bodovi ovise isključivo o zapisu, nikad o onome što klijent tvrdi", () => {
    const { log } = playLog(SEED, 6);
    const r = replayLog(SEED, [...log] as LogEntry[], dict);
    // dodatna polja koja bi klijent mogao poslati (score…) se ignoriraju
    const forged = log.map((e) => ({ ...e, score: 999999 })) as unknown as LogEntry[];
    const r2 = replayLog(SEED, forged, dict);
    expect(r.ok && r2.ok && r.value.summary.score === r2.value.summary.score).toBe(true);
    expect(r.ok && r.value.summary.score).toBeLessThan(999999);
  });

  it("zapis bez ijedne riječi (samo eksplozije) je valjan i daje 0 bodova", () => {
    const { log } = playLog(SEED, 0);
    const r = replayLog(SEED, log, dict);
    expect(r.ok && r.value.summary.score).toBe(0);
  });

  it("brzi odgovori daju combo, a nakon brzog odgovora tajmer je 1 s dulji (eksplozija mora biti u tom trenutku)", () => {
    let state = initialState();
    const log: LogEntry[] = [];
    for (let i = 0; i < 3; i++) {
      const syl = syllableAt(SEED, state.step);
      const word = wordFor(syl, state.used);
      const t = Math.max(minTypingMs(word.length), 700);
      log.push({ w: word, t });
      state = applyWord(state, syl, word, t).state;
    }
    expect(state.combo).toBe(3);
    const ok = replayLog(SEED, log, dict, { requireOver: false });
    expect(ok.ok && ok.value.state.maxCombo).toBe(3);
    expect(ok.ok && ok.value.state.lastFast).toBe(true);

    // tajmer sada traje (10 − 3·0,25 + 1) s = 10,25 s: eksplozija na 9 750 ms je nevaljana, na 10 250 ms valjana
    const limit = timeLimitMs(state);
    expect(limit).toBe(10_250);
    expect(replayLog(SEED, [...log, { w: null, t: limit - 1000 }], dict, { requireOver: false }).ok).toBe(false);
    expect(replayLog(SEED, [...log, { w: null, t: limit }], dict, { requireOver: false }).ok).toBe(true);
  });
});

describe("server replay: odbija nevaljane zapise", () => {
  const good = () => playLog(SEED, 5).log;
  const reject = (log: LogEntry[], opts = {}) => {
    const r = replayLog(SEED, log, dict, opts);
    expect(r.ok).toBe(false);
    return r.ok ? "" : r.error;
  };

  it("riječ koja nije u rječniku", () => {
    const log = good();
    log[2] = { ...log[2], w: "xqzkvbt" };
    expect(reject(log)).toMatch(/korak 3/);
  });
  it("riječ koja ne sadrži slog", () => {
    const log = good();
    const syl = syllableAt(SEED, 0);
    const other = "kravata".includes(syl) ? "kuća" : "kravata";
    log[0] = { w: other, t: 3000 };
    expect(reject(log)).toMatch(/no-syllable/);
  });
  it("ista riječ dvaput u istoj partiji (replay odbija: used)", () => {
    // Traži seed kod kojeg prva dva sloga dijele zajedničku riječ, pa je ta riječ upisana dvaput.
    for (let i = 0; i < 400; i++) {
      const seed = `bomba:ponavljanje-${i}`;
      const [s0, s1] = [syllableAt(seed, 0), syllableAt(seed, 1)];
      const w = allWords().find((x) => x.length >= 6 && x.includes(s0) && x.includes(s1) && /^[a-zčćšžđ]+$/.test(x));
      if (!w) continue;
      const log: LogEntry[] = [
        { w, t: 3000 },
        { w, t: 3000 },
      ];
      const r = replayLog(seed, log, dict, { requireOver: false });
      expect(r.ok).toBe(false);
      expect(r.ok ? "" : r.error).toMatch(/korak 2.*used/);
      // a jednom je ista riječ valjana
      expect(replayLog(seed, [log[0]], dict, { requireOver: false }).ok).toBe(true);
      return;
    }
    throw new Error("nije nađen seed s dva slogova u istoj riječi");
  });
  it("odgovor nakon isteka tajmera", () => {
    const log = good();
    log[0] = { ...log[0], t: 10_000 }; // limit prvog je točno 10 000 ms
    expect(reject(log)).toMatch(/nakon isteka/);
  });
  it("prebrz unos (bot)", () => {
    const log = good();
    log[0] = { ...log[0], t: 20 };
    expect(reject(log)).toMatch(/prebrzo/);
  });
  it("eksplozija prije isteka tajmera ili nakon njega", () => {
    const log = good();
    const i = log.findIndex((e) => e.w === null);
    log[i] = { w: null, t: log[i].t - 500 };
    expect(reject(log)).toMatch(/eksplozija/);
  });
  it("zapis nastavlja nakon kraja igre", () => {
    const log = good();
    log.push({ w: "kravata", t: 3000 });
    expect(reject(log)).toMatch(/nakon kraja/);
  });
  it("nezavršena partija se ne priznaje kao rangirana", () => {
    const log = good();
    log.pop();
    expect(reject(log)).toMatch(/nije završena/);
    expect(replayLog(SEED, log, dict, { requireOver: false }).ok).toBe(true);
  });
  it("neispravan oblik zapisa", () => {
    expect(reject([{ w: "kravata", t: -5 }])).toMatch(/vrijeme/);
    expect(reject([{ w: "kravata", t: 1.5 }])).toMatch(/vrijeme/);
    expect(reject([{ w: 5 as unknown as string, t: 1000 }])).toMatch(/riječ/);
    expect(reject("nope" as unknown as LogEntry[])).toMatch(/popis/);
  });
  it("preduga partija", () => {
    const log = Array.from({ length: 5000 }, () => ({ w: null, t: 10_000 })) as LogEntry[];
    expect(reject(log)).toMatch(/predug/);
  });
  it("zapis za pogrešan seed (drugi dan) ne prolazi", () => {
    const { log } = playLog("bomba:2026-11-11", 8);
    expect(replayLog(SEED, log, dict).ok).toBe(false);
  });
});

describe("provjera proteklog vremena", () => {
  it("zapis ne smije trajati dulje od stvarno protekla vremena", () => {
    const start = 1_000_000;
    expect(checkElapsed(60_000, start, start + 61_000).ok).toBe(true);
    expect(checkElapsed(60_000, start, start + 58_000).ok).toBe(true); // unutar rezerve
    expect(checkElapsed(60_000, start, start + 20_000).ok).toBe(false); // „ubrzani" zapis
    expect(checkElapsed(1, start, start - 1).ok).toBe(false);
  });
});
