import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createUserClient, STAGE_BUCKET } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const deny = (status: number, message: string) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/stage?challenge=sig-020&stage=3
 * Redirects to a 60-second signed URL for that stage image — but only if the signed-in
 * player has started the challenge and already revealed that stage (or has finished it).
 * Supabase mode only; local demo mode serves the static files from /challenges.
 */
export async function GET(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return deny(404, "Not available in demo mode");

  const challenge = req.nextUrl.searchParams.get("challenge") ?? "";
  const stage = Number(req.nextUrl.searchParams.get("stage"));
  if (!/^sig-\d{1,6}$/.test(challenge) || !Number.isInteger(stage) || stage < 1 || stage > 5) return deny(400, "Bad request");

  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return deny(401, "Sign in first");

  // RLS limits this to the caller's own attempt.
  const { data: attempt } = await supabase.from("daily_attempts").select("stage, status").eq("challenge_id", challenge).maybeSingle();
  if (!attempt) return deny(403, "Start the challenge first");
  if (attempt.status === "playing" && stage > attempt.stage) return deny(403, "Stage not revealed yet");

  const admin = createAdminClient();
  const { data: row } = await admin.from("challenges").select("stage_images").eq("id", challenge).single();
  const path = row?.stage_images?.[stage - 1];
  if (!path) return deny(404, "Not found");

  const { data: signed, error } = await admin.storage.from(STAGE_BUCKET).createSignedUrl(path, 60);
  if (error || !signed) return deny(500, "Could not sign image");

  const res = NextResponse.redirect(signed.signedUrl, 302);
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
