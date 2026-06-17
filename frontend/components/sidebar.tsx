"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { ConversationList } from "@/components/conversation-list";
import { NewChatDialog } from "@/components/new-chat-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export function Sidebar() {
  const router = useRouter();
  const me = useStore((s) => s.me);

  async function logout() {
    await api.post("/api/auth/logout").catch(() => {});
    router.replace("/login");
  }

  return (
    <aside className="flex h-screen flex-col border-r bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={me?.username ?? ""} photoUrl={me?.photo_url} />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{me?.username}</p>
            <p className="truncate text-xs text-muted-foreground">{me?.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NewChatDialog />
          <Button variant="ghost" size="icon" onClick={logout} title="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <ConversationList />
    </aside>
  );
}
