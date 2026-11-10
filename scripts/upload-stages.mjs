// Uploads public/challenges/<slug>/stage-N.webp to the PRIVATE Supabase bucket as <challenge-id>/stage-N.webp.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-stages.mjs
// Ids follow the order of challenges.json (sig-001, sig-002, ...), matching scripts/generate-seed.mjs.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

const root = new URL("..", import.meta.url).pathname;
const defs = JSON.parse(fs.readFileSync(path.join(root, "src/lib/data/challenges.json"), "utf8"));
const supabase = createClient(url, key, { auth: { persistSession: false } });

for (const [i, d] of defs.entries()) {
  const id = `sig-${String(i + 1).padStart(3, "0")}`;
  for (let s = 1; s <= 5; s++) {
    const file = path.join(root, "public/challenges", d.slug, `stage-${s}.webp`);
    const { error } = await supabase.storage.from("challenge-stages").upload(`${id}/stage-${s}.webp`, fs.readFileSync(file), {
      contentType: "image/webp",
      upsert: true,
    });
    if (error) throw new Error(`${id} stage ${s}: ${error.message}`);
  }
  console.log("uploaded", id);
}
