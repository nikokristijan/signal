/** Normalizacija unosa: bez dijakritika igrač i dalje može pogoditi („kisobran" → „kišobran"). */

const FOLD: Record<string, string> = { č: "c", ć: "c", š: "s", ž: "z", đ: "d" };

/** Zamjenjuje č, ć, š, ž, đ osnovnim slovima. */
export function fold(s: string): string {
  let out = "";
  for (const c of s) out += FOLD[c] ?? c;
  return out;
}

export function hasDiacritics(s: string): boolean {
  return /[čćšžđ]/.test(s);
}

/** Mala slova, bez razmaka na rubovima, NFC (npr. č upisan kao c + kvačica postaje „č"). Ostalo ne dira. */
export function normalizeInput(raw: string): string {
  return raw.normalize("NFC").trim().toLocaleLowerCase("hr");
}

/** Upis „dž/lj/nj" kao jedno unicode slovo (ǆ, ǉ, ǌ) tretira se kao dva slova. */
export function expandDigraphs(s: string): string {
  return s.replace(/ǆ/g, "dž").replace(/ǉ/g, "lj").replace(/ǌ/g, "nj");
}
