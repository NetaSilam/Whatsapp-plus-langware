"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Conversation = {
  id: string;
  type: "dm" | "group";
  title: string;
  avatarUrl: string | null;
  lastMessage: { body: string | null; createdAt: string } | null;
};

type UserHit = { id: string; displayName: string; email: string };

export function ConversationList() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  // Poll the conversation list so new chats / messages surface without a reload.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok || !active) return;
      setConversations(await res.json());
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  // Search users to start a new DM (debounced).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
      if (seq !== searchSeq.current) return; // a newer search superseded this
      setHits(res.ok ? await res.json() : []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function startChat(peerUserId: string) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerUserId }),
    });
    if (!res.ok) return;
    const { id } = await res.json();
    setQuery("");
    setHits([]);
    router.push(`/chats/${id}`);
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href="/chats/new-group">New group</Link>
        </Button>
      </div>
      <div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people to message…"
        />
        {query.trim() && (
          <div className="mt-2 grid gap-1 rounded-md border p-1">
            {searching && (
              <p className="p-2 text-sm text-muted-foreground">Searching…</p>
            )}
            {!searching && hits.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">No users found.</p>
            )}
            {hits.map((u) => (
              <button
                key={u.id}
                onClick={() => startChat(u.id)}
                className="flex items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="grid">
                  <span>{u.displayName}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">Message</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-1">
        {conversations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No conversations yet. Search for someone above to start chatting.
          </p>
        )}
        {conversations.map((c) => (
          <Link
            key={c.id}
            href={`/chats/${c.id}`}
            className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent"
          >
            {/* Avatar */}
            {c.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.avatarUrl} alt={c.title} className="h-10 w-10 shrink-0 rounded-full border object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-semibold">
                {c.title[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {c.type === "group" && (
                  <span className="mr-1 text-xs text-muted-foreground">[group]</span>
                )}
                {c.title}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {c.lastMessage
                  ? (c.lastMessage.body ?? "📎 Attachment")
                  : "No messages yet"}
              </div>
            </div>
            {c.lastMessage && (
              <time className="shrink-0 text-xs text-muted-foreground">
                {new Date(c.lastMessage.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            )}
          </Link>
        ))}
      </div>

      <Button variant="ghost" onClick={() => router.refresh()} className="justify-self-start">
        Refresh
      </Button>
    </div>
  );
}
