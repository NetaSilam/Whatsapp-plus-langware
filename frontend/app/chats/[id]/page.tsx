"use client";

import { useParams } from "next/navigation";

import { ChatView } from "@/components/chat-view";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatView conversationId={id} />;
}
