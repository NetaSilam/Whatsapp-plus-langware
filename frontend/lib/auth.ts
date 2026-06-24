import { createClient } from "@/lib/supabase/server";

// Resolves the signed-in user from the request's Supabase session cookie.
// Use in route handlers and server components; returns null when unauthenticated.
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
