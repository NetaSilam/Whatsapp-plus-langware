import { notFound, redirect } from "next/navigation";

import { GroupInfo } from "@/components/group-info";
import { createClient } from "@/lib/supabase/server";

export default async function ChatInfoPage({
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

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, is_group, title, created_by")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) notFound();

  if (!conv.is_group) {
    // 1:1 has no group settings; bounce back to the chat.
    redirect(`/chats/${conversationId}`);
  }

  const { data: members } = await supabase
    .from("conversation_members")
    .select("user_id, profiles(display_name)")
    .eq("conversation_id", conversationId);

  type ProfileLike =
    | { display_name?: string }
    | { display_name?: string }[]
    | null;

  const initialMembers = (members ?? []).map((row) => {
    const profiles = (row as { profiles?: ProfileLike }).profiles;
    const name = Array.isArray(profiles)
      ? profiles[0]?.display_name
      : profiles?.display_name;
    return { userId: row.user_id, displayName: name ?? "Unknown" };
  });

  return (
    <GroupInfo
      conversationId={conversationId}
      title={conv.title ?? "Group"}
      createdBy={conv.created_by}
      meId={user.id}
      initialMembers={initialMembers}
    />
  );
}
