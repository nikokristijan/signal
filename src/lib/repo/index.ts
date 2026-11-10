import { LocalRepository } from "./local";
import type { GameRepository } from "./types";

let instance: GameRepository | null = null;

/** Supabase is used only when both env vars are set; otherwise the app runs in local demo mode. */
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getRepository(): Promise<GameRepository> {
  if (instance) return instance;
  if (supabaseConfigured()) {
    const { SupabaseRepository } = await import("./supabase");
    instance = new SupabaseRepository(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  } else {
    instance = new LocalRepository();
  }
  return instance;
}
