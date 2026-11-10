import { createBrowserClient } from "@supabase/ssr";

export function createBrowser(url: string, anonKey: string) {
  return createBrowserClient(url, anonKey);
}
