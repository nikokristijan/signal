// Renders a labelled contact sheet of specific candidates (500px thumbnails) so a human can choose.
//   node scripts/preview-candidates.mjs <outFile.jpg> <candidatesDir/slug.json> <index> [index ...]
import fs from "node:fs/promises";
import sharp from "sharp";

const UA = "SignalPuzzleGame/0.1 (educational hobby project; contact via GitHub repo)";
const [out, file, ...idx] = process.argv.slice(2);
const cands = JSON.parse(await fs.readFile(file, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 12; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    await sleep(Math.max(Number(r.headers.get("retry-after")) || 0, 8) * 1000);
  }
  throw new Error("failed " + url);
}
const tiles = [];
for (const [n, i] of idx.map(Number).entries()) {
  const buf = await sharp(await get(cands[i].thumb)).resize(400, 300, { fit: "cover" }).jpeg().toBuffer();
  const label = Buffer.from(`<svg width="400" height="300"><rect width="40" height="30" fill="#000" opacity=".75"/><text x="20" y="22" font-size="20" font-family="sans-serif" fill="#fff" text-anchor="middle">${i}</text></svg>`);
  tiles.push({ input: await sharp(buf).composite([{ input: label }]).jpeg().toBuffer(), left: (n % 3) * 400, top: Math.floor(n / 3) * 300 });
  await sleep(1500);
}
const rows = Math.ceil(idx.length / 3);
await sharp({ create: { width: 1200, height: rows * 300, channels: 3, background: "#fff" } }).composite(tiles).jpeg({ quality: 80 }).toFile(out);
console.log("ok");
