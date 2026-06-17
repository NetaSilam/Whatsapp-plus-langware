"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

function preview(c: Conversation): string {
  const m = c.last_message;
  if (!m) return "No messages yet";
  if (m.kind === "system") return m.body ?? "";
  if (m.kind === "image") return "📷 Photo";
  if (m.kind === "file") return "📎 Attachment";
  return m.body ?? "";
}

export function ConversationList() {
  const pathname = usePathname();
  const conversations = useStore((s) => s.conversations);
  const online = useStore((s) => s.online);

  return (
    <ScrollArea className="flex-1">
      <ul className="divide-y">
        {conversations.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            No conversations yet. Start one with the ✏️ button.
          </li>
        )}
        {conversations.map((c) => {
          const active = pathname === `/chats/${c.id}`;
          const isOnline = c.type === "direct" && c.other_user
            ? !!online[c.other_user.id]
            : false;
          return (
            <li key={c.id}>
              <Link
                href={`/chats/${c.id}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent",
                  active && "bg-accent",
                )}
              >
                <UserAvatar
                  name={c.title}
                  photoUrl={c.photo_url}
                  isGroup={c.type === "group"}
                  online={isOnline}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{c.title}</p>
                    {c.last_message && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {listTime(c.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-muted-foreground">{preview(c)}</p>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-medium text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
