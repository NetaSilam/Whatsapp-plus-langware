import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { TerminalList } from "@/components/terminal-list";
import { getCurrentUser } from "@/lib/auth";

export default async function TerminalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Terminals</h1>
        <div className="flex items-center gap-3">
          <Link href="/chats" className="text-sm text-muted-foreground hover:underline">
            Chats
          </Link>
          <Link href="/status" className="text-sm text-muted-foreground hover:underline">
            Status
          </Link>
          <LogoutButton />
        </div>
      </div>
      <TerminalList />
    </main>
  );
}
