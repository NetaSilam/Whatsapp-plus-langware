import { redirect } from "next/navigation";

import { StatusBoard } from "@/components/status-board";
import { getCurrentUser } from "@/lib/auth";

export default async function StatusPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Status</h1>
      <StatusBoard currentUserId={user.id} />
    </main>
  );
}
