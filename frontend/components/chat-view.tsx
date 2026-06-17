"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useApp } from "@/components/app-provider";
import { ChatHeader } from "@/components/chat-header";
import { Composer } from "@/components/composer";
import { MessageList } from "@/components/message-list";
import { api } from "@/lib/api";

// xterm is browser-only — keep it out of the server-render graph.
const TerminalPanel = dynamic(
  () => import("@/components/terminal-panel").then((m) => m.TerminalPanel),
  { ssr: false },
);
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";

export function ChatView({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { supabase, refreshConversations } = useApp();
  const me = useStore((s) => s.me);
  const conversation = useStore((s) =>
    s.conversations.find((c) => c.id === conversationId),
  );
  const setMessages = useStore((s) => s.setMessages);
  const addMessage = useStore((s) => s.addMessage);
  const applyAggregates = useStore((s) => s.applyAggregates);
  const clearUnread = useStore((s) => s.clearUnread);
  const [terminalOpen, setTerminalOpen] = useState(false);

  // Load history + mark the conversation read on open.
  useEffect(() => {
    setTerminalOpen(false);
    let cancelled = false;
    (async () => {
      const msgs = await api.get<Message[]>(
        `/api/conversations/${conversationId}/messages`,
      );
      if (cancelled) return;
      setMessages(conversationId, msgs);
      await api.post(`/api/conversations/${conversationId}/read`, {}).catch(() => {});
      clearUnread(conversationId);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, setMessages, clearUnread]);

  // Realtime for this conversation.
  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel(`conv:${conversationId}`);
    channel
      .on("broadcast", { event: "message.new" }, ({ payload }) => {
        const msg = payload as Message;
        addMessage(msg);
        if (msg.sender_id !== me.id && msg.kind !== "system") {
          api
            .post(`/api/conversations/${conversationId}/read`, {
              up_to_message_id: msg.id,
            })
            .catch(() => {});
          clearUnread(conversationId);
        }
      })
      .on("broadcast", { event: "receipt.update" }, ({ payload }) => {
        const p = payload as { aggregates: Record<string, "sent" | "delivered" | "read"> };
        applyAggregates(conversationId, p.aggregates);
      })
      .on("broadcast", { event: "members.changed" }, () => refreshConversations())
      .on("broadcast", { event: "group.deleted" }, () => {
        refreshConversations();
        router.push("/chats");
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    conversationId,
    me,
    supabase,
    addMessage,
    applyAggregates,
    clearUnread,
    refreshConversations,
    router,
  ]);

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Conversation unavailable
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <ChatHeader
        conversation={conversation}
        terminalOpen={terminalOpen}
        onToggleTerminal={() => setTerminalOpen((v) => !v)}
      />
      <MessageList conversation={conversation} />
      {terminalOpen && (
        <TerminalPanel
          conversationId={conversationId}
          onClose={() => setTerminalOpen(false)}
        />
      )}
      <Composer conversationId={conversationId} />
    </div>
  );
}
