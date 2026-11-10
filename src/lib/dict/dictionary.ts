import { gunzipSync } from "fflate";
import { fold } from "./fold";

/** Abeceda zapisa u hr.bin (mora odgovarati scripts/build-dictionary.mjs). */
export const DICT_ALPHABET = "abcdefghijklmnopqrstuvwxyzčćšžđ";

/**
 * Rječnik svih oblika riječi. Čuva se kao front-coded popis sortiran po (složeni ključ, riječ),
 * podijeljen u blokove koji se dekodiraju samostalno. U memoriji je ≈3,5 MB (ne milijun JS stringova).
 * Pretraga: binarno po blokovima, zatim dekodiranje jednog bloka (≤128 zapisa).
 */
export class Dictionary {
  readonly size: number;
  private readonly data: Uint8Array;
  private readonly blockSize: number;
  private readonly offsets: Uint32Array;
  private readonly firstFold: string[];

  static fromGzip(gz: Uint8Array): Dictionary {
    return new Dictionary(gunzipSync(gz));
  }

  constructor(data: Uint8Array) {
    const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (magic !== "BMB1") throw new Error("Neispravan format rječnika");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.size = view.getUint32(4, true);
    this.blockSize = view.getUint16(8, true);
    this.data = data;

    const blocks = Math.ceil(this.size / this.blockSize);
    this.offsets = new Uint32Array(blocks);
    this.firstFold = new Array<string>(blocks);
    let p = 12;
    for (let i = 0; i < this.size; i++) {
      const len = data[p + 1];
      if (i % this.blockSize === 0) {
        const b = i / this.blockSize;
        this.offsets[b] = p;
        // Prvi zapis bloka ima lcp = 0, pa se dekodira bez prethodne riječi.
        let w = "";
        for (let j = 0; j < len; j++) w += DICT_ALPHABET[data[p + 2 + j] - 1];
        this.firstFold[b] = fold(w);
      }
      p += 2 + len;
    }
  }

  private decodeBlock(b: number): string[] {
    const out: string[] = [];
    let p = this.offsets[b];
    let prev = "";
    const end = Math.min(this.size, (b + 1) * this.blockSize);
    for (let i = b * this.blockSize; i < end; i++) {
      const lcp = this.data[p];
      const len = this.data[p + 1];
      let w = prev.slice(0, lcp);
      for (let j = 0; j < len; j++) w += DICT_ALPHABET[this.data[p + 2 + j] - 1];
      out.push(w);
      prev = w;
      p += 2 + len;
    }
    return out;
  }

  /** Sve riječi čiji je složeni oblik (bez dijakritika) jednak `key`. */
  lookupFold(key: string): string[] {
    const blocks = this.offsets.length;
    let lo = 0;
    let hi = blocks - 1;
    let start = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.firstFold[mid] < key) {
        start = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const found: string[] = [];
    for (let b = start; b < blocks; b++) {
      for (const w of this.decodeBlock(b)) {
        const f = fold(w);
        if (f === key) found.push(w);
        else if (f > key) return found;
      }
    }
    return found;
  }

  /** Točna provjera (s dijakriticima). */
  has(word: string): boolean {
    return this.lookupFold(fold(word)).includes(word);
  }
}
