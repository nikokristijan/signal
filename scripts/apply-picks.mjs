// Copies the chosen candidate photo (source URL + credit) into src/lib/data/challenges.json.
//   node scripts/apply-picks.mjs <picks.json> <candidatesRoot>
// picks.json: { "<slug>": { "dir": "meta", "index": 3, "focus": {"x":.5,"y":.4}, "frame": {...}, "zooms": [...] } }
// candidatesRoot/<dir>/<slug>.json are the files written by scripts/find-photos.mjs.
import fs from "node:fs";
import path from "node:path";

const [picksFile, cand] = process.argv.slice(2);
const picks = JSON.parse(fs.readFileSync(picksFile, "utf8"));
const file = new URL("../src/lib/data/challenges.json", import.meta.url).pathname;
const defs = JSON.parse(fs.readFileSync(file, "utf8"));

for (const d of defs) {
  const p = picks[d.slug];
  if (!p) continue;
  const c = JSON.parse(fs.readFileSync(path.join(cand, p.dir, `${d.slug}.json`), "utf8"))[p.index];
  if (!c) throw new Error(`${d.slug}: no candidate ${p.index}`);
  d.source = { url: c.url.split("?")[0], width: c.width, height: c.height };
  const pd = /public domain|cc0/i.test(c.license);
  d.credit = {
    title: c.title,
    author: c.author || (pd ? "Unknown author (public domain)" : "Unknown"),
    license: c.license,
    licenseUrl: c.licenseUrl || "",
    page: c.page,
  };
  if (p.focus) d.focus = p.focus;
  if (p.frame) d.frame = p.frame;
  if (p.zooms) d.zooms = p.zooms;
}
fs.writeFileSync(file, JSON.stringify(defs, null, 2) + "\n");
console.log("applied", Object.keys(picks).length);
