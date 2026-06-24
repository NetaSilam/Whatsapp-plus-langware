import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TerminalView } from "@/components/terminal-view";
import { db } from "@/lib/db";
import { terminals } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const [terminal] = await db
    .select()
    .from(terminals)
    .where(and(eq(terminals.id, id), eq(terminals.ownerId, user.id)))
    .limit(1);
  if (!terminal) redirect("/terminals");

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/terminals"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">{terminal.name}</h1>
      </div>
      <TerminalView terminalId={terminal.id} />
      <p className="mt-2 text-xs text-muted-foreground">
        Live PowerShell session on the host (dev-only, no sandbox).
      </p>
    </main>
  );
}
