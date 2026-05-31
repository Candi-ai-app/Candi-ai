import "server-only";
import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY admin client — uses the service_role key, which BYPASSES RLS.
// Never import this into a client component. Used for trusted server reads/writes
// (demo data, the import pipeline) until per-user auth + RLS scoping lands.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
