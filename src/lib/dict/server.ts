import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Dictionary } from "./dictionary";

let cached: Dictionary | null = null;

/** Učitava rječnik s diska (jednom po procesu). Koristi se za server-side replay partije. */
export function getServerDictionary(): Dictionary {
  if (!cached) {
    const file = path.join(process.cwd(), "public", "dict", "hr.bin.gz");
    cached = Dictionary.fromGzip(new Uint8Array(fs.readFileSync(file)));
  }
  return cached;
}
