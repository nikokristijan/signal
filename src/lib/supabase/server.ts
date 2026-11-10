import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Supabase klijent u ime prijavljenog igrača (čita cookieje koje postavlja preglednik). */
export async function createUserClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: () => {
        /* samo za čitanje: sesiju osvježava preglednik */
      },
    },
  });
}

/** Service-role klijent. SAMO NA SERVERU: zaobilazi RLS i smije pozvati bomba_record_result. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY nije postavljen");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}
