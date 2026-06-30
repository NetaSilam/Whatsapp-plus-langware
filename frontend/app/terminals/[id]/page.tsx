import { or, eq, and } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TerminalView } from "@/components/terminal-view";
import { TerminalSharePanel } from "@/components/terminal-share-panel";
import { db } from "@/lib/db";
import { terminals, terminalMembers } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  // Allow access if owner or invited member.
  const [terminal] = await db
    .select({ id: terminals.id, name: terminals.name, ownerId: terminals.ownerId })
    .from(terminals)
    .where(eq(terminals.id, id))
    .limit(1);

  if (!terminal) redirect("/terminals");

  const isOwner = terminal.ownerId === user.id;
  if (!isOwner) {
    const [membership] = await db
      .select({ terminalId: terminalMembers.terminalId })
      .from(terminalMembers)
      .where(
        and(
          eq(terminalMembers.terminalId, id),
          eq(terminalMembers.userId, user.id),
        ),
      )
      .limit(1);
    if (!membership) redirect("/terminals");
  }

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/terminals" className="text-sm text-muted-foreground hover:underline">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">{terminal.name}</h1>
        {!isOwner && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            shared
          </span>
        )}
      </div>
      <TerminalView terminalId={terminal.id} />
      {isOwner && <TerminalSharePanel terminalId={terminal.id} />}
      <p className="mt-2 text-xs text-muted-foreground">
        Live PowerShell session on the host (dev-only, no sandbox).
      </p>
    </main>
  );
}
