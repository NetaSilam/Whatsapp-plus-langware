import { notFound, redirect } from "next/navigation";

import { ChatView } from "@/components/chat-view";
import { createClient } from "@/lib/supabase/server";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: conversationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS already restricts visible conversations to ones we're a member of,
  // so an empty result means: not a member, or no such conversation.
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, is_group, title")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) notFound();

  // Resolve the chat title + counterpart info — for 1:1 the counterpart
  // drives the header. Group chats just use the title.
  let title = conv.title ?? null;
  let counterpartId: string | null = null;
  let counterpartLastSeenAt: string | null = null;

  if (!conv.is_group) {
    const { data: others } = await supabase
      .from("conversation_members")
      .select("user_id, profiles(display_name, last_seen_at)")
      .eq("conversation_id", conversationId)
      .neq("user_id", user.id);
    type ProfileLike =
      | { display_name?: string; last_seen_at?: string | null }
      | { display_name?: string; last_seen_at?: string | null }[]
      | null;
    const first = (others ?? [])[0] as
      | { user_id: string; profiles?: ProfileLike }
      | undefined;
    const profile = Array.isArray(first?.profiles)
      ? first?.profiles[0]
      : first?.profiles;
    counterpartId = first?.user_id ?? null;
    counterpartLastSeenAt = profile?.last_seen_at ?? null;
    title = profile?.display_name ?? "Direct chat";
  }

  return (
    <ChatView
      conversationId={conversationId}
      meId={user.id}
      title={title ?? "Chat"}
      isGroup={conv.is_group}
      counterpartId={counterpartId}
      counterpartLastSeenAt={counterpartLastSeenAt}
    />
  );
}
