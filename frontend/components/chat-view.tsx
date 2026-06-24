"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Attachment = {
  id: string;
  kind: "image" | "file";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type Message = {
  id: string;
  senderId: string;
  body: string | null;
  createdAt: string;
  attachments: Attachment[];
};

function AttachmentView({ a }: { a: Attachment }) {
  const href = `/api/attachments?id=${a.id}`;
  if (a.kind === "image") {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={a.fileName}
          className="mt-1 max-h-60 rounded-md border"
        />
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-block rounded-md border bg-background/50 px-3 py-2 text-xs underline"
    >
      📎 {a.fileName}
    </a>
  );
}

export function ChatView({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [typing, setTyping] = useState<{ userId: string; displayName: string }[]>(
    [],
  );
  const lastAt = useRef<string | null>(null);
  const lastPingRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function append(incoming: Message[]) {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    lastAt.current = incoming[incoming.length - 1].createdAt;
  }

  useEffect(() => {
    let active = true;
    setTyping([]);
    const base = `/api/messages?conversationId=${encodeURIComponent(conversationId)}`;
    const poll = async () => {
      const url = lastAt.current
        ? `${base}&after=${encodeURIComponent(lastAt.current)}`
        : base;
      const res = await fetch(url);
      if (!res.ok || !active) return;
      append(await res.json());
    };
    const pollTyping = async () => {
      const res = await fetch(
        `/api/typing?conversationId=${encodeURIComponent(conversationId)}`,
      );
      if (res.ok && active) setTyping(await res.json());
    };
    poll();
    pollTyping();
    const t = setInterval(poll, 2000);
    const tt = setInterval(pollTyping, 2000);
    return () => {
      active = false;
      clearInterval(t);
      clearInterval(tt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Broadcast that I'm typing, throttled to once every 2s while editing.
  function onDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (now - lastPingRef.current > 2000) {
      lastPingRef.current = now;
      fetch("/api/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      }).catch(() => {});
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      if (res.ok) {
        const att = await res.json();
        setPending((p) => [...p, att]);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if ((!text && pending.length === 0) || sending) return;
    setSending(true);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        body: text,
        attachmentIds: pending.map((p) => p.id),
      }),
    });
    setSending(false);
    if (res.ok) {
      setDraft("");
      setPending([]);
      append([await res.json()]);
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-1">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No messages yet — say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div
              key={m.id}
              className={mine ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  "max-w-[75%] rounded-2xl px-3 py-2 text-sm " +
                  (mine
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground")
                }
              >
                {m.body && (
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                )}
                {m.attachments?.map((a) => (
                  <AttachmentView key={a.id} a={a} />
                ))}
                <time className="mt-1 block text-[10px] opacity-70">
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {pending.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pending.map((p) => (
            <button
              key={p.id}
              onClick={() => setPending((arr) => arr.filter((x) => x.id !== p.id))}
              className="rounded-full bg-secondary px-3 py-1 text-xs"
              title="Remove"
            >
              {p.kind === "image" ? "🖼" : "📎"} {p.fileName} ✕
            </button>
          ))}
        </div>
      )}

      <div className="h-5 px-1 pt-1 text-xs italic text-muted-foreground">
        {typing.length > 0 &&
          `${typing.map((t) => t.displayName).join(", ")} ${
            typing.length === 1 ? "is" : "are"
          } typing…`}
      </div>

      <form onSubmit={send} className="mt-1 flex items-center gap-2 border-t pt-3">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="Attach files"
        >
          {uploading ? "…" : "📎"}
        </Button>
        <Input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Type a message"
          autoFocus
        />
        <Button
          type="submit"
          disabled={sending || (!draft.trim() && pending.length === 0)}
        >
          Send
        </Button>
      </form>
    </div>
  );
}
