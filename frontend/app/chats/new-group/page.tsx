import Link from "next/link";
import { redirect } from "next/navigation";

import { NewGroup } from "@/components/new-group";
import { getCurrentUser } from "@/lib/auth";

export default async function NewGroupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/chats" className="text-sm text-muted-foreground hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New group</h1>
      </div>
      <NewGroup />
    </main>
  );
}
