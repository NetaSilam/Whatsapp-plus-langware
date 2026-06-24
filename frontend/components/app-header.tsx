import { eq } from "drizzle-orm";
import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";

// Global top bar shown on every authenticated page. Renders nothing when no
// user is signed in (e.g. the login/signup pages).
export async function AppHeader() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [profile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const name = profile?.displayName ?? user.email;

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex max-w-4xl items-center justify-between gap-4 p-3">
        <div className="flex items-center gap-4">
          <Link href="/chats" className="font-semibold">
            WhatsApp+
          </Link>
          <nav className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link href="/chats" className="hover:underline">
              Chats
            </Link>
            <Link href="/status" className="hover:underline">
              Status
            </Link>
            <Link href="/terminals" className="hover:underline">
              Terminals
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" title="Signed in">
            {name}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
