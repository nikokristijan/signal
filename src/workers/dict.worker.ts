/// <reference lib="webworker" />
import { Dictionary } from "@/lib/dict/dictionary";
import { resolveWord } from "@/lib/dict/resolve";

/**
 * Web worker koji drži rječnik izvan glavne niti: UI ostaje tečan, a provjera riječi je trenutna
 * (nema mrežnog poziva; rječnik se jednom preuzme ≈ 0,5 MB gzip i dekodira ≈ 3,5 MB u memoriji).
 */
let dict: Dictionary | null = null;

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      const res = await fetch(m.url);
      if (!res.ok) throw new Error("fetch " + res.status);
      dict = Dictionary.fromGzip(new Uint8Array(await res.arrayBuffer()));
      (self as unknown as Worker).postMessage({ type: "ready", size: dict.size });
    } else if (m.type === "check" && dict) {
      (self as unknown as Worker).postMessage({ type: "result", id: m.id, res: resolveWord(dict, m.input, m.syllable, m.used) });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: "error", message: String(err), id: m.id });
  }
};
