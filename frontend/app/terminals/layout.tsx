import { redirect } from "next/navigation";

import { OnlineProvider } from "@/components/online-provider";
import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function TerminalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const me = {
    id: user.id,
    displayName: profile?.display_name ?? user.email ?? "you",
  };

  return (
    <OnlineProvider me={me}>
      <div className="flex h-screen bg-background">
        <Sidebar me={me} />
        <section className="flex flex-1 flex-col">{children}</section>
      </div>
    </OnlineProvider>
  );
}
