import type { WordRejection } from "../game/types";
import { MAX_WORD_INPUT } from "../game/constants";
import type { Dictionary } from "./dictionary";
import { expandDigraphs, fold, hasDiacritics, normalizeInput } from "./fold";

export type Resolution = { ok: true; word: string } | { ok: false; reason: WordRejection };

/**
 * Provjerava upisanu riječ za dani slog i vraća KANONSKI oblik iz rječnika.
 *
 *  - unos bez dijakritika vrijedi („kisobran" → „kišobran"), ali slog se i dalje mora točno
 *    nalaziti u pravoj riječi (npr. za „ŠA" ne vrijedi „sat");
 *  - unos s dijakriticima mora točno odgovarati rječniku;
 *  - riječ koja je već iskorištena (po kanonskom obliku) se odbija.
 */
export function resolveWord(dict: Dictionary, raw: string, syllable: string, used: ReadonlySet<string> | readonly string[]): Resolution {
  const usedSet = used instanceof Set ? used : new Set(used as readonly string[]);
  const input = expandDigraphs(normalizeInput(raw));
  if (!input) return { ok: false, reason: "empty" };
  const syl = syllable.toLocaleLowerCase("hr");
  if (input.length > MAX_WORD_INPUT || !/^[a-zčćšžđqwxy]+$/.test(input)) return { ok: false, reason: "not-in-dictionary" };

  // Brza provjera sloga (bez dijakritika) prije pretrage rječnika.
  if (!fold(input).includes(fold(syl))) return { ok: false, reason: "no-syllable" };

  let candidates = dict.lookupFold(fold(input));
  if (hasDiacritics(input)) candidates = candidates.filter((c) => c === input);
  if (candidates.length === 0) return { ok: false, reason: "not-in-dictionary" };

  const matching = candidates.filter((c) => c.includes(syl));
  if (matching.length === 0) return { ok: false, reason: "no-syllable" };

  const free = matching.find((c) => !usedSet.has(c));
  if (!free) return { ok: false, reason: "used" };
  return { ok: true, word: free };
}

export const REJECTION_TEXT: Record<WordRejection, string> = {
  empty: "Upiši riječ",
  "no-syllable": "Nema sloga",
  "not-in-dictionary": "Nema u rječniku",
  used: "Već iskorišteno",
  invalid: "Neispravan unos",
};
