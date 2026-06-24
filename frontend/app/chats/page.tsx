import Link from "next/link";
import { redirect } from "next/navigation";

import { ConversationList } from "@/components/conversation-list";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/auth";

// Authenticated home: the conversation list. Middleware gates access; the
// redirect is a server-side backstop.
export default async function ChatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Chats</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/status"
            className="text-sm text-muted-foreground hover:underline"
          >
            Status
          </Link>
          <Link
            href="/terminals"
            className="text-sm text-muted-foreground hover:underline"
          >
            Terminals
          </Link>
          <LogoutButton />
        </div>
      </div>
      <ConversationList />
    </main>
  );
}
