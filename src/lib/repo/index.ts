import { LocalRepository } from "./local";
import type { BombRepository } from "./types";

let instance: BombRepository | null = null;

/** Supabase se koristi samo ako su postavljene obje varijable; inače radi lokalni demo. */
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getRepository(): Promise<BombRepository> {
  if (instance) return instance;
  if (supabaseConfigured()) {
    const { SupabaseRepository } = await import("./supabase");
    instance = new SupabaseRepository(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  } else {
    instance = new LocalRepository();
  }
  return instance;
}
