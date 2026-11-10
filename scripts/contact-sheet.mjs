// QA helper: renders one row per challenge (its five stages side by side) so a human can check
// difficulty and ambiguity at a glance.   node scripts/contact-sheet.mjs <outDir> [rowsPerSheet]
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = new URL("..", import.meta.url).pathname;
const defs = JSON.parse(await fs.readFile(path.join(root, "src/lib/data/challenges.json"), "utf8"));
const out = process.argv[2] ?? "/tmp/signal-sheets";
const perSheet = Number(process.argv[3] ?? 8);
await fs.mkdir(out, { recursive: true });
const TW = 240;
const TH = 180;

for (let s = 0; s * perSheet < defs.length; s++) {
  const slice = defs.slice(s * perSheet, (s + 1) * perSheet);
  const composites = [];
  for (let r = 0; r < slice.length; r++) {
    const label = Buffer.from(`<svg width="${TW * 5}" height="22"><rect width="${TW * 5}" height="22" fill="#111"/><text x="6" y="16" font-size="14" font-family="sans-serif" fill="#fff">${s * perSheet + r + 1}. ${slice[r].slug}</text></svg>`);
    composites.push({ input: label, left: 0, top: r * (TH + 22) });
    for (let i = 0; i < 5; i++) {
      const f = path.join(root, "public/challenges", slice[r].slug, `stage-${i + 1}.webp`);
      if (!(await fs.stat(f).catch(() => null))) continue;
      composites.push({ input: await sharp(f).resize(TW, TH).jpeg().toBuffer(), left: i * TW, top: r * (TH + 22) + 22 });
    }
  }
  await sharp({ create: { width: TW * 5, height: slice.length * (TH + 22), channels: 3, background: "#fff" } })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(path.join(out, `sheet-${s + 1}.jpg`));
}
console.log("done");
