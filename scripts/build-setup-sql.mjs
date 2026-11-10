// Spaja sve migracije u JEDNU datoteku koju je dovoljno zalijepiti u Supabase SQL editor:
//   npm run sql:setup      → supabase/setup.sql
// (Za nadogradnju postojeće baze koristi pojedinačne migracije redom.)
import fs from "node:fs";
import path from "node:path";

const dir = path.join(new URL("..", import.meta.url).pathname, "supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const body = files.map((f) => `-- ════════════════════════════ ${f} ════════════════════════════\n${fs.readFileSync(path.join(dir, f), "utf8").trimEnd()}\n`).join("\n");
const header = `-- BOMBA: potpuno postavljanje baze (sve migracije odjednom).
-- Zalijepi cijelu datoteku u Supabase → SQL Editor → Run, na PRAZNOM projektu.
-- Generirano skriptom scripts/build-setup-sql.mjs (npm run sql:setup). Ne uređuj ručno.
-- Migracije: ${files.join(", ")}
-- Ako baza već ima starije migracije, ne pokreći ovo, nego samo one koje nedostaju.

`;
fs.writeFileSync(path.join(dir, "..", "setup.sql"), header + body);
console.log(`supabase/setup.sql: ${files.length} migracija, ${(header + body).length} znakova`);
