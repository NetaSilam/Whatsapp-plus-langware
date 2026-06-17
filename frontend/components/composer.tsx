"use client";

import { useRef, useState } from "react";
import { Paperclip, SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";

type UploadResult = {
  storage_path: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  file_name: string | null;
};

export function Composer({ conversationId }: { conversationId: string }) {
  const me = useStore((s) => s.me);
  const addMessage = useStore((s) => s.addMessage);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    const clientMsgId = crypto.randomUUID();
    // Optimistic bubble.
    addMessage({
      id: clientMsgId,
      conversation_id: conversationId,
      sender_id: me!.id,
      body,
      kind: "text",
      client_msg_id: clientMsgId,
      created_at: new Date().toISOString(),
      attachments: [],
      status: "sent",
      pending: true,
    });
    try {
      const saved = await api.post<Message>(`/api/conversations/${conversationId}/messages`, {
        body,
        kind: "text",
        client_msg_id: clientMsgId,
      });
      addMessage(saved);
    } catch {
      /* leave optimistic bubble; user can retry */
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const up = await api.upload<UploadResult>(file);
      const kind = up.mime_type.startsWith("image/") ? "image" : "file";
      const saved = await api.post<Message>(`/api/conversations/${conversationId}/messages`, {
        body: null,
        kind,
        client_msg_id: crypto.randomUUID(),
        attachments: [up],
      });
      addMessage(saved);
    } finally {
      setUploading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t bg-card p-3">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={onFile}
        accept="image/*,application/pdf,.doc,.docx,.txt,.zip,.csv,.xlsx"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title="Attach"
      >
        <Paperclip className="h-5 w-5" />
      </Button>
      <textarea
        ref={taRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={uploading ? "Uploading…" : "Type a message"}
        className="max-h-32 flex-1 resize-none rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <Button size="icon" className="rounded-full" onClick={send} disabled={!text.trim()}>
        <SendHorizontal className="h-5 w-5" />
      </Button>
    </div>
  );
}
