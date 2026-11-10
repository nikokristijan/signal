// Dev tool: finds candidate photos on Wikimedia Commons for each puzzle subject,
// downloads small thumbnails and builds one contact sheet per subject so a human
// can pick the best photo. Output goes to the directory given as argv[2].
//   node scripts/find-photos.mjs <outDir> [slug ...]
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const UA = "SignalPuzzleGame/0.1 (educational hobby project; contact via GitHub repo)";
const out = process.argv[2];
const only = process.argv.slice(3);
const NOTHUMBS = process.env.NOTHUMBS === "1";
const PER = NOTHUMBS ? 12 : 4;
const queries = JSON.parse(await fs.readFile(new URL("./photo-queries.json", import.meta.url)));
await fs.mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s = "") => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function api(params) {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", ...params });
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.json();
    const wait = Math.max(Number(r.headers.get("retry-after")) || 0, 5 * (i + 1)) * 1000;
    console.error(`api ${r.status}, waiting ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error("api failed " + url);
}

async function download(url) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const wait = Math.max(Number(r.headers.get("retry-after")) || 0, 4 * (i + 1)) * 1000;
    console.error(`download ${r.status}, waiting ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error("download failed " + url);
}

for (const [slug, q] of Object.entries(queries)) {
  if (only.length && !only.includes(slug)) continue;
  if (!only.length && (await fs.stat(path.join(out, `${slug}.json`)).catch(() => null))) continue;
  const cands = [];
  const seen = new Set();
  const passes = [
    `${q} filetype:bitmap haswbstatement:P6731=Q63348049|P6731=Q63348069`,
    `${q} filetype:bitmap`,
  ];
  for (const gsrsearch of passes) {
    if (cands.length >= PER) break;
    const data = await api({
      action: "query", generator: "search", gsrsearch, gsrnamespace: "6", gsrlimit: "50",
      prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "500",
    });
    const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || ii.mime !== "image/jpeg" || seen.has(p.title)) continue;
      const ratio = ii.width / ii.height;
      if (ii.width < 2400 || ii.height < 1600 || ratio < 1.2 || ratio > 2.1) continue;
      const m = ii.extmetadata ?? {};
      const license = strip(m.LicenseShortName?.value);
      if (/fair use|NC|ND/i.test(license)) continue;
      seen.add(p.title);
      cands.push({
        title: p.title, url: ii.url, thumb: ii.thumburl?.replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/"), width: ii.width, height: ii.height,
        author: strip(m.Artist?.value), license, licenseUrl: m.LicenseUrl?.value ?? "",
        page: ii.descriptionurl,
      });
      if (cands.length === PER) break;
    }
    await sleep(3000);
  }
  const tiles = [];
  for (let i = 0; i < (NOTHUMBS ? 0 : cands.length); i++) {
    try {
      const buf = await download(cands[i].thumb);
      const img = await sharp(buf).resize(320, 240, { fit: "cover" }).jpeg().toBuffer();
      const label = Buffer.from(`<svg width="320" height="240"><rect x="0" y="0" width="34" height="30" fill="#000" opacity=".75"/><text x="17" y="22" font-size="20" font-family="sans-serif" fill="#fff" text-anchor="middle">${i}</text></svg>`);
      tiles.push({ input: await sharp(img).composite([{ input: label }]).jpeg().toBuffer(), left: (i % 4) * 320, top: 0 });
    } catch (e) { console.error(slug, i, e.message); }
    await sleep(2500);
  }
  await fs.writeFile(path.join(out, `${slug}.json`), JSON.stringify(cands, null, 2));
  if (tiles.length) {
    await sharp({ create: { width: 1280, height: 240, channels: 3, background: "#fff" } }).composite(tiles).jpeg({ quality: 80 }).toFile(path.join(out, `${slug}.jpg`));
  }
  console.log(slug, cands.length);
  await sleep(NOTHUMBS ? 2500 : 4000);
}
