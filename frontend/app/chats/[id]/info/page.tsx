import Link from "next/link";
import { redirect } from "next/navigation";

import { GroupInfo } from "@/components/group-info";
import { getCurrentUser } from "@/lib/auth";

export default async function GroupInfoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/chats/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to chat
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Group info</h1>
      </div>
      <GroupInfo conversationId={id} />
    </main>
  );
}
