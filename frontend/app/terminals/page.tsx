import { redirect } from "next/navigation";

import { TerminalList } from "@/components/terminal-list";
import { getCurrentUser } from "@/lib/auth";

export default async function TerminalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Terminals</h1>
      <TerminalList />
    </main>
  );
}
