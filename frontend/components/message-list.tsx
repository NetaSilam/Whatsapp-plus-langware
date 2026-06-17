"use client";

import { useEffect, useRef } from "react";

import { MessageBubble } from "@/components/message-bubble";
import { useStore } from "@/lib/store";
import type { Conversation, Message } from "@/lib/types";

// Stable reference so the selector doesn't return a fresh [] each render
// (which would trigger an infinite update loop).
const EMPTY: Message[] = [];

export function MessageList({ conversation }: { conversation: Conversation }) {
  const me = useStore((s) => s.me);
  const messages = useStore((s) => s.messages[conversation.id] ?? EMPTY);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length]);

  const nameById = new Map(conversation.members.map((m) => [m.id, m.username]));

  return (
    <div
      className="flex-1 space-y-1.5 overflow-y-auto p-4"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)",
        backgroundSize: "20px 20px",
      }}
    >
      {messages.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No messages yet. Say hello 👋
        </p>
      )}
      {messages.map((m, i) => {
        const mine = m.sender_id === me?.id;
        const prev = messages[i - 1];
        const showSender =
          conversation.type === "group" &&
          !mine &&
          m.kind !== "system" &&
          (!prev || prev.sender_id !== m.sender_id || prev.kind === "system");
        return (
          <MessageBubble
            key={m.id}
            message={m}
            mine={mine}
            senderName={nameById.get(m.sender_id)}
            showSender={showSender}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
