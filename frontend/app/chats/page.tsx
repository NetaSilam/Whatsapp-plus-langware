import { redirect } from "next/navigation";

import { ConversationList } from "@/components/conversation-list";
import { getCurrentUser } from "@/lib/auth";

// Authenticated home: the conversation list. Middleware gates access; the
// redirect is a server-side backstop.
export default async function ChatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Chats</h1>
      <ConversationList />
    </main>
  );
}
