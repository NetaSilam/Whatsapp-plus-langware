"use client";

import Link from "next/link";
import { ArrowLeft, TerminalSquare } from "lucide-react";

import { GroupSettingsSheet } from "@/components/group-settings-sheet";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { lastSeen } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChatHeader({
  conversation,
  onToggleTerminal,
  terminalOpen,
}: {
  conversation: Conversation;
  onToggleTerminal: () => void;
  terminalOpen: boolean;
}) {
  const online = useStore((s) => s.online);

  let subtitle: string;
  if (conversation.type === "direct" && conversation.other_user) {
    subtitle = online[conversation.other_user.id]
      ? "online"
      : lastSeen(conversation.other_user.last_seen);
  } else {
    subtitle = conversation.members.map((m) => m.username).join(", ");
  }

  return (
    <header className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
      <Link href="/chats" className="md:hidden">
        <Button variant="ghost" size="icon">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </Link>
      <UserAvatar
        name={conversation.title}
        photoUrl={conversation.photo_url}
        isGroup={conversation.type === "group"}
        online={
          conversation.type === "direct" && conversation.other_user
            ? !!online[conversation.other_user.id]
            : false
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-tight">{conversation.title}</p>
        <p
          className={cn(
            "truncate text-xs",
            subtitle === "online" ? "text-emerald-600" : "text-muted-foreground",
          )}
        >
          {subtitle}
        </p>
      </div>
      <Button
        variant={terminalOpen ? "default" : "ghost"}
        size="icon"
        onClick={onToggleTerminal}
        title="Shared terminal"
      >
        <TerminalSquare className="h-5 w-5" />
      </Button>
      {conversation.type === "group" && <GroupSettingsSheet conversation={conversation} />}
    </header>
  );
}
