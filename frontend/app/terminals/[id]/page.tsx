import { notFound, redirect } from "next/navigation";

import { TerminalView } from "@/components/terminal-view";
import { createClient } from "@/lib/supabase/server";

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: terminalId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS gates this to terminals I'm a member of.
  const { data: term } = await supabase
    .from("terminals")
    .select("id, title, created_by")
    .eq("id", terminalId)
    .maybeSingle();
  if (!term) notFound();

  // Need the access token to authenticate the WebSocket. The token is
  // short-lived (1h) — reload the page if it expires mid-session.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  return (
    <TerminalView
      terminalId={terminalId}
      title={term.title}
      accessToken={session.access_token}
    />
  );
}
