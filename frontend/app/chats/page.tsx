import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { MeCheck } from "@/components/me-check";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

// Phase 1 placeholder for the authenticated area. Middleware already gates
// access; the redirect here is a server-side backstop. Phase 2 replaces this
// with the real conversation list.
export default async function ChatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));

  return (
    <main className="container mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {profile?.displayName ?? user.email}
        </h1>
        <LogoutButton />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>You are signed in</CardTitle>
          <CardDescription>
            Conversations arrive in Phase 2. For now this confirms auth works
            end-to-end.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="text-muted-foreground">
            <div>Email: {user.email}</div>
            <div>User ID: {user.id}</div>
          </div>
          <MeCheck />
        </CardContent>
      </Card>
    </main>
  );
}
