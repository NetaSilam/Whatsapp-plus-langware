import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key. Bypasses RLS — use
// strictly in route handlers for Storage uploads and signed URLs, never import
// from client components.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
