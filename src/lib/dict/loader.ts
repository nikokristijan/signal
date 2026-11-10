import { Dictionary } from "./dictionary";

export const DICT_URL = "/dict/hr.bin.gz";

let loading: Promise<Dictionary> | null = null;

/** Učitava rječnik na glavnoj niti (za lokalni „server" replay i rekonstrukciju partije). Jednom po stranici. */
export function loadDictionary(): Promise<Dictionary> {
  if (!loading) {
    loading = fetch(DICT_URL)
      .then((r) => {
        if (!r.ok) throw new Error("Rječnik se nije učitao");
        return r.arrayBuffer();
      })
      .then((buf) => Dictionary.fromGzip(new Uint8Array(buf)))
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}
