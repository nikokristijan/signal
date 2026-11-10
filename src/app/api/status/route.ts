import { createAdminClient } from "@/lib/supabase/server";
import { json } from "@/lib/server-games";

export const dynamic = "force-dynamic";

const ZERO = "00000000-0000-4000-8000-000000000000";

/**
 * GET /api/status: je li aplikacija spojena na Supabase i je li baza spremna. Vraća samo istinito/neistinito,
 * nikakve tajne. Služi stranici „Prijatelji" da kaže zašto se pravi prijatelji (ne) mogu dodavati.
 *
 *  mode "demo"     – nema Supabase varijabli: podaci su u pregledniku, a prijatelji simulirani;
 *  mode "supabase" – spojeno; `schema` kaže koje su migracije primijenjene.
 */
export async function GET() {
  const configured = {
    url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  if (!configured.url || !configured.anonKey || !configured.serviceRole) return json({ mode: "demo", configured, ready: false });

  const admin = createAdminClient();
  const probe = async (table: string, column: string) => {
    const { error } = await admin.from(table).select(column).eq(table === "games" && column === "id" ? "id" : "game_id", ZERO);
    return !error;
  };
  const schema = {
    base: await probe("games", "id"), // 0001
    unlimitedGames: await probe("scores", "game_id"), // 0002
    leagues: await probe("scores", "mode"), // 0003
  };
  return json({ mode: "supabase", configured, schema, ready: schema.base && schema.unlimitedGames && schema.leagues });
}
