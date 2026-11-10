// Gradi rječnik i bazu slogova iz hunspell rječnika `dictionary-hr` (LGPL-2.1 ili SISSL, vidi NOTICE-rjecnik.txt).
//   npm run rjecnik
//
// Izlaz:
//   public/dict/hr.bin.gz           – svi oblici riječi, front-coded, sortirani po (složeni ključ, riječ)
//   src/lib/data/slogovi.json       – slogovi (2–3 slova) s brojem riječi koje ih sadrže, podijeljeni u težine
//
// Format hr.bin (nakon gunzip):  "BMB1" | u32 LE broj riječi | u16 LE veličina bloka | u16 rezervirano | zapisi...
//   zapis = [lcp:u8][duljina sufiksa:u8][sufiks: 1 bajt po slovu, indeks u ABECEDA + 1]
//   lcp se računa u odnosu na PRETHODNU riječ; na početku svakog bloka (svaki BLOCK-ti zapis) lcp = 0,
//   pa se blok može dekodirati samostalno (binarno pretraživanje po blokovima).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { IterableHunspellReader } from "hunspell-reader";

export const ABECEDA = "abcdefghijklmnopqrstuvwxyzčćšžđ";
const FOLD = { č: "c", ć: "c", š: "s", ž: "z", đ: "d" };
export const fold = (w) => [...w].map((c) => FOLD[c] ?? c).join("");

const root = new URL("..", import.meta.url).pathname;
const base = path.join(root, "node_modules/dictionary-hr/index");

// ── 1. proširi sve oblike ───────────────────────────────────────────────────
const reader = await IterableHunspellReader.createFromFiles(base + ".aff", base + ".dic");
const all = new Set();
for (const w of reader.seqWords()) all.add(w);
console.log("oblika iz hunspella:", all.size);

// ── 2. filtriraj ─────────────────────────────────────────────────────────────
// Samo obične (ne vlastite) riječi: mala slova hrvatske abecede, 3–24 slova,
// moraju imati samoglasnik ili slogotvorno „r" (isključuje kratice poput „cm", „dm").
const words = [...all].filter((w) => /^[a-zčćšžđ]{3,24}$/.test(w) && /[aeiour]/.test(w));
console.log("nakon filtra:", words.length);

// ── 3. sortiraj po (složeni ključ, riječ) ────────────────────────────────────
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const keyed = words.map((w) => [fold(w), w]).sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));

// ── 4. front-coding ──────────────────────────────────────────────────────────
export const BLOCK = 128;
const bytes = [];
let prev = "";
for (const [idx, [, w]] of keyed.entries()) {
  if (idx % BLOCK === 0) prev = "";
  let l = 0;
  const m = Math.min(prev.length, w.length);
  while (l < m && prev[l] === w[l]) l++;
  bytes.push(l, w.length - l);
  for (let i = l; i < w.length; i++) bytes.push(ABECEDA.indexOf(w[i]) + 1);
  prev = w;
}
const header = Buffer.alloc(12);
header.write("BMB1", 0, "ascii");
header.writeUInt32LE(keyed.length, 4);
header.writeUInt16LE(BLOCK, 8);
const raw = Buffer.concat([header, Buffer.from(bytes)]);
const gz = zlib.gzipSync(raw, { level: 9 });
fs.mkdirSync(path.join(root, "public/dict"), { recursive: true });
fs.writeFileSync(path.join(root, "public/dict/hr.bin.gz"), gz);
console.log(`hr.bin: ${raw.length} B, gzip: ${gz.length} B (${(gz.length / 1024).toFixed(0)} KB)`);

// ── 5. slogovi ───────────────────────────────────────────────────────────────
// Slog je 2 ili 3 slova abecede bez q, w, x, y. Težinu NE određuje broj oblika (isti korijen u 14 padeža
// bi precijenio lakoću: „jgr" ima 266 oblika, ali samo jedan korijen), nego broj RAZLIČITIH korijena,
// aproksimiran različitim prvih 5 slova riječi koje sadrže slog.
const OK = new Set("abcčćdđefghijklmnoprsštuvzž");
const counts = new Map();
const roots = new Map();
for (const w of words) {
  const seen = new Set();
  for (const n of [2, 3]) {
    for (let i = 0; i + n <= w.length; i++) {
      const s = w.slice(i, i + n);
      if ([...s].every((c) => OK.has(c))) seen.add(s);
    }
  }
  const root = w.slice(0, 5);
  for (const s of seen) {
    counts.set(s, (counts.get(s) ?? 0) + 1);
    let set = roots.get(s);
    if (!set) roots.set(s, (set = new Set()));
    set.add(root);
  }
}

const MIN_ROOTS = 40; // ispod ovoga slog nije pošteno rješiv
const EASY_ROOTS = 400;
const MEDIUM_ROOTS = 120;
const pool = [...counts]
  .map(([s, n]) => ({ s, n, r: roots.get(s).size }))
  .filter((x) => x.r >= MIN_ROOTS)
  .sort((a, b) => b.r - a.r || cmp(a.s, b.s));
const tiers = { lako: [], srednje: [], tesko: [] };
for (const x of pool) (x.r >= EASY_ROOTS ? tiers.lako : x.r >= MEDIUM_ROOTS ? tiers.srednje : tiers.tesko).push(x.s);
// Poredak unutar težine je fiksan (abecedno) da generator bude deterministički.
for (const k of Object.keys(tiers)) tiers[k].sort(cmp);
const out = {
  napomena: "Generirano skriptom scripts/build-dictionary.mjs. Ne uređuj ručno.",
  pragovi: { minKorijena: MIN_ROOTS, lako: EASY_ROOTS, srednje: MEDIUM_ROOTS },
  slogovi: tiers,
};
fs.writeFileSync(path.join(root, "src/lib/data/slogovi.json"), JSON.stringify(out) + "\n");
// Statistika (samo za testove/analizu, ne ulazi u klijentski paket).
fs.writeFileSync(
  path.join(root, "src/lib/data/slogovi-statistika.json"),
  JSON.stringify({ korijeni: Object.fromEntries(pool.map((x) => [x.s, x.r])), rijeci: Object.fromEntries(pool.map((x) => [x.s, x.n])) }) + "\n",
);
for (const [k, v] of Object.entries(tiers)) {
  console.log(k.padEnd(8), String(v.length).padStart(4), "slogova;", "primjeri:", v.slice(0, 10).join(" "));
}
const dist = { 2: 0, 3: 0 };
for (const x of pool) dist[x.s.length]++;
console.log("2 slova:", dist[2], "| 3 slova:", dist[3], "| ukupno:", pool.length);
