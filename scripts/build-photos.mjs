// Builds the five zoom-stage images for every challenge from ONE original photograph.
//   node scripts/build-photos.mjs [slug ...]      (set NODE_USE_ENV_PROXY=1 behind a proxy)
// Originals are downloaded from Wikimedia Commons into .photo-cache/ (git-ignored);
// only the five small WebP crops per challenge are committed to public/challenges/.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_ZOOMS, stageRects } from "./crop.mjs";

const UA = "SignalPuzzleGame/0.1 (educational hobby project; contact via GitHub repo)";
const root = new URL("..", import.meta.url).pathname;
const defs = JSON.parse(await fs.readFile(path.join(root, "src/lib/data/challenges.json"), "utf8"));
const only = process.argv.slice(2);
const OUT_W = 800;
const OUT_H = 600;
const MIN_SOURCE_PX = 180; // never crop tighter than this many source pixels wide (stage 1 is a deliberate extreme close-up)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikimedia throttles originals hard (Retry-After: 600) but serves standard-size thumbnails freely,
// so we fetch a 3840px thumbnail (sources must be wider than that; otherwise fall back to 1920px).
function thumbUrl(def) {
  const width = def.source.width > 3840 ? 3840 : 1920;
  return def.source.url.replace(/\/commons\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/, `/commons/thumb/$1/$2/${width}px-$2`);
}

async function download(url, file) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) {
      await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
      return;
    }
    const wait = Math.max(Number(r.headers.get("retry-after")) || 0, Math.min(8 * (i + 1), 45)) * 1000;
    if (wait > 120_000) throw new Error(`rate limited for ${wait / 1000}s: ${url}`);
    console.error(`  ${r.status} - waiting ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error("download failed: " + url);
}

await fs.mkdir(path.join(root, ".photo-cache"), { recursive: true });

const failed = [];
for (const def of defs) {
  try {
  if (only.length && !only.includes(def.slug)) continue;
  if (!def.source?.url) {
    console.log("skip (no source)", def.slug);
    continue;
  }
  const cache = path.join(root, ".photo-cache", `${def.slug}.jpg`);
  if (!(await fs.stat(cache).catch(() => null))) {
    console.log("download", def.slug);
    await download(thumbUrl(def), cache);
    await sleep(3000);
  }

  // Apply EXIF orientation first, then cut the largest 4:3 frame around def.frame (default: centre).
  const upright = await sharp(cache).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  const W = meta.width;
  const H = meta.height;
  let fw = Math.min(W, Math.floor((H * 4) / 3));
  fw -= fw % 4;
  const fh = (fw * 3) / 4;
  const frame = def.frame ?? { x: 0.5, y: 0.5 };
  const fx = Math.round(Math.min(Math.max(frame.x * W - fw / 2, 0), W - fw));
  const fy = Math.round(Math.min(Math.max(frame.y * H - fh / 2, 0), H - fh));

  // Limit the tightest zoom so the extreme close-up is still reasonably sharp.
  const zooms = [...(def.zooms ?? DEFAULT_ZOOMS)];
  zooms[0] = Math.min(zooms[0], fw / MIN_SOURCE_PX);
  const rects = stageRects(def.focus, zooms);

  const dir = path.join(root, "public/challenges", def.slug);
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const left = fx + Math.round(r.x * fw);
    const top = fy + Math.round(r.y * fh);
    const width = Math.min(Math.round(r.w * fw), W - left);
    const height = Math.min(Math.round(r.h * fh), H - top);
    await sharp(upright)
      .extract({ left, top, width, height })
      .resize(OUT_W, OUT_H, { fit: "fill", kernel: "lanczos3" })
      .webp({ quality: 80 })
      .toFile(path.join(dir, `stage-${i + 1}.webp`));
  }
  console.log("built", def.slug, `${W}x${H}`, "frame", `${fw}x${fh}`, "zoom1", zooms[0].toFixed(1));
  } catch (e) {
    console.error("FAILED", def.slug, e.message);
    failed.push(def.slug);
  }
}
if (failed.length) console.error("Failed:", failed.join(" "));
