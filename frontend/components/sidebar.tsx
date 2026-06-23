import Link from "next/link";

import { ConversationList } from "@/components/conversation-list";
import { LogoutButton } from "@/components/logout-button";
import { TerminalList } from "@/components/terminal-list";
import { Button } from "@/components/ui/button";

export function Sidebar({
  me,
}: {
  me: { id: string; displayName: string };
}) {
  return (
    <aside className="flex w-80 flex-col border-r bg-muted/30">
      <header className="flex items-center justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{me.displayName}</p>
          <p className="text-xs text-muted-foreground">WhatsApp+</p>
        </div>
        <LogoutButton />
      </header>
      <div className="flex flex-col gap-2 p-3">
        <Button asChild className="w-full" variant="secondary">
          <Link href="/chats/new">+ New chat</Link>
        </Button>
        <Button asChild className="w-full" variant="outline">
          <Link href="/chats/new-group">+ New group</Link>
        </Button>
        <Button asChild className="w-full" variant="outline">
          <Link href="/terminals/new">+ New terminal</Link>
        </Button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <p className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Conversations
        </p>
        <ConversationList meId={me.id} />
        <p className="border-b border-t px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Terminals
        </p>
        <TerminalList />
      </div>
    </aside>
  );
}
