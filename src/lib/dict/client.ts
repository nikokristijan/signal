import type { Resolution } from "./resolve";
import { resolveWord } from "./resolve";
import { DICT_URL, loadDictionary } from "./loader";

/**
 * Pristup rječniku iz sučelja: web worker ako postoji, inače glavna nit.
 * `check` ne ide na mrežu, nego samo u memoriju (worker) pa je odgovor trenutan.
 */
export class DictClient {
  private worker: Worker | null = null;
  private pending = new Map<number, (r: Resolution) => void>();
  private nextId = 1;
  readonly ready: Promise<void>;
  private fallback: Promise<import("./dictionary").Dictionary> | null = null;

  constructor() {
    this.ready = this.start();
  }

  private start(): Promise<void> {
    if (typeof Worker === "undefined") {
      this.fallback = loadDictionary();
      return this.fallback.then(() => undefined);
    }
    return new Promise<void>((resolve, reject) => {
      try {
        const worker = new Worker(new URL("../../workers/dict.worker.ts", import.meta.url), { type: "module" });
        this.worker = worker;
        worker.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m.type === "ready") resolve();
          else if (m.type === "result") {
            this.pending.get(m.id)?.(m.res);
            this.pending.delete(m.id);
          } else if (m.type === "error" && m.id === undefined) reject(new Error(m.message));
        };
        worker.onerror = () => {
          // Worker se nije mogao pokrenuti: prebaci se na glavnu nit.
          this.worker = null;
          this.fallback = loadDictionary();
          this.fallback.then(() => resolve(), reject);
        };
        worker.postMessage({ type: "init", url: DICT_URL });
      } catch {
        this.fallback = loadDictionary();
        this.fallback.then(() => resolve(), reject);
      }
    });
  }

  async check(input: string, syllable: string, used: readonly string[]): Promise<Resolution> {
    await this.ready;
    if (this.worker) {
      const id = this.nextId++;
      return new Promise<Resolution>((resolve) => {
        this.pending.set(id, resolve);
        this.worker!.postMessage({ type: "check", id, input, syllable, used });
      });
    }
    const dict = await (this.fallback ?? loadDictionary());
    return resolveWord(dict, input, syllable, used);
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
