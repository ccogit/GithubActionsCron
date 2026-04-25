import { createClient as _create } from "@supabase/supabase-js";

export function createClient() {
  return _create(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
