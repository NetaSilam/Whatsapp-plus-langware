import { and, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChatView } from "@/components/chat-view";
import { db } from "@/lib/db";
import {
  conversation,
  conversationMembers,
  groups,
  profiles,
} from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  // Authorize: the viewer must be a member of this conversation.
  const [membership] = await db
    .select({ type: conversation.type })
    .from(conversationMembers)
    .innerJoin(conversation, eq(conversation.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userId, user.id),
      ),
    )
    .limit(1);
  if (!membership) redirect("/chats");

  const isGroup = membership.type === "group";
  let title = "Conversation";
  if (isGroup) {
    const [g] = await db
      .select({ name: groups.name })
      .from(groups)
      .where(eq(groups.conversationId, id))
      .limit(1);
    title = g?.name ?? "Group";
  } else {
    const [peer] = await db
      .select({ displayName: profiles.displayName })
      .from(conversationMembers)
      .innerJoin(profiles, eq(profiles.id, conversationMembers.userId))
      .where(
        and(
          eq(conversationMembers.conversationId, id),
          ne(conversationMembers.userId, user.id),
        ),
      )
      .limit(1);
    title = peer?.displayName ?? "Conversation";
  }

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/chats"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">{title}</h1>
        {isGroup && (
          <Link
            href={`/chats/${id}/info`}
            className="ml-auto text-sm text-muted-foreground hover:underline"
          >
            Group info
          </Link>
        )}
      </div>
      <ChatView conversationId={id} currentUserId={user.id} />
    </main>
  );
}
