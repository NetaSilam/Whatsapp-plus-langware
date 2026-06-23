"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  PresenceDot,
  formatLastSeen,
  useIsOnline,
  useMe,
} from "@/components/online-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type AttachmentKind = "image" | "file" | "audio" | "video";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  attachment_path: string | null;
  attachment_kind: AttachmentKind | null;
  attachment_mime: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  created_at: string;
};

type Reaction = { message_id: string; user_id: string; emoji: string };

const MAX_BYTES = 25 * 1024 * 1024;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const TYPING_BROADCAST_MS = 1500;
const TYPING_DISPLAY_MS = 3000;

function attachmentKindFromMime(mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function publicUrlFor(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/chat-attachments/${path}`;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatView({
  conversationId,
  meId,
  title,
  isGroup,
  counterpartId,
  counterpartLastSeenAt,
}: {
  conversationId: string;
  meId: string;
  title: string;
  isGroup: boolean;
  counterpartId: string | null;
  counterpartLastSeenAt: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  // userId -> last time we received their typing broadcast
  const [typingMap, setTypingMap] = useState<
    Map<string, { displayName: string; lastReceivedAt: number }>
  >(new Map());
  const [paletteForMessage, setPaletteForMessage] = useState<string | null>(
    null,
  );
  // otherMembers: their last_read_at for receipts. 1:1 has one entry.
  const [othersLastRead, setOthersLastRead] = useState<Map<string, string | null>>(
    new Map(),
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const [, forceRender] = useState(0);

  const counterpartOnline = useIsOnline(counterpartId);
  const me = useMe();

  // === LOAD MESSAGES + REACTIONS + RECEIPTS ===

  const loadMessages = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, body, attachment_path, attachment_kind, attachment_mime, attachment_name, attachment_size, created_at",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (!error && data) setMessages(data as Message[]);
    setLoading(false);
  }, [conversationId]);

  const loadReactions = useCallback(
    async (msgIds: string[]) => {
      if (msgIds.length === 0) {
        setReactions([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji")
        .in("message_id", msgIds);
      setReactions((data as Reaction[]) ?? []);
    },
    [],
  );

  const loadOthersLastRead = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("conversation_members")
      .select("user_id, last_read_at")
      .eq("conversation_id", conversationId)
      .neq("user_id", meId);
    const m = new Map<string, string | null>();
    for (const row of (data as { user_id: string; last_read_at: string | null }[]) ?? []) {
      m.set(row.user_id, row.last_read_at);
    }
    setOthersLastRead(m);
  }, [conversationId, meId]);

  const markRead = useCallback(async () => {
    const supabase = createClient();
    await supabase
      .from("conversation_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", meId);
  }, [conversationId, meId]);

  // === MOUNT: load + subscribe ===

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setReactions([]);
    setOthersLastRead(new Map());
    setTypingMap(new Map());
    setPaletteForMessage(null);

    void (async () => {
      await loadMessages();
      await loadOthersLastRead();
      await markRead();
    })();

    const supabase = createClient();

    // Messages: inserts
    const msgChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
          if (m.sender_id !== meId) {
            void markRead();
          }
        },
      )
      .subscribe();

    // conversation_members: updates (others' last_read_at)
    const memberChannel = supabase
      .channel(`conv-members:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void loadOthersLastRead();
        },
      )
      .subscribe();

    // reactions: any change — refetch reactions for current messages
    const reactionsChannel = supabase
      .channel("reactions-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => {
          setMessages((current) => {
            void loadReactions(current.map((m) => m.id));
            return current;
          });
        },
      )
      .subscribe();

    // typing broadcast
    const typingChannel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    typingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        const p = payload.payload as { userId: string; displayName: string };
        if (!p?.userId || p.userId === meId) return;
        console.log("[typing] received", {
          conversationId,
          from: { userId: p.userId, displayName: p.displayName },
          at: new Date().toISOString(),
        });
        setTypingMap((prev) => {
          const next = new Map(prev);
          next.set(p.userId, {
            displayName: p.displayName,
            lastReceivedAt: Date.now(),
          });
          return next;
        });
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    return () => {
      void supabase.removeChannel(msgChannel);
      void supabase.removeChannel(memberChannel);
      void supabase.removeChannel(reactionsChannel);
      void supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
    };
  }, [
    conversationId,
    meId,
    loadMessages,
    loadOthersLastRead,
    loadReactions,
    markRead,
  ]);

  // Refetch reactions whenever the message list changes (e.g., a new message
  // arrives — its reactions are likely empty, but ensures consistency).
  useEffect(() => {
    void loadReactions(messages.map((m) => m.id));
  }, [messages, loadReactions]);

  // Tick once a second so expired typing entries fall out of the displayed
  // list without needing per-user timeouts.
  useEffect(() => {
    const t = setInterval(() => {
      console.log("[typing] heartbeat tick", {
        at: new Date().toISOString(),
      });
      forceRender((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll on new message.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // === COMPOSE + UPLOAD ===

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(`File is too large (max ${humanSize(MAX_BYTES)}).`);
      return;
    }
    setError(null);
    setStagedFile(file);
  }

  function clearStaged() {
    setStagedFile(null);
  }

  function broadcastTyping(displayName: string) {
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_BROADCAST_MS) {
      console.log("[typing] sent (throttled, skipped)", {
        conversationId,
        from: { userId: meId, displayName },
        msSinceLast: now - lastTypingSentRef.current,
      });
      return;
    }
    lastTypingSentRef.current = now;
    const ch = typingChannelRef.current;
    if (!ch) {
      console.log("[typing] sent (no channel, skipped)", {
        conversationId,
        from: { userId: meId, displayName },
      });
      return;
    }
    console.log("[typing] sent", {
      conversationId,
      from: { userId: meId, displayName },
      at: new Date().toISOString(),
    });
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: meId, displayName },
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!stagedFile && !body) return;
    if (sending) return;

    setSending(true);
    setError(null);

    const supabase = createClient();
    let payload: Partial<Message> & {
      conversation_id: string;
      sender_id: string;
    } = {
      conversation_id: conversationId,
      sender_id: meId,
      body: body || null,
    };

    if (stagedFile) {
      const path = `${conversationId}/${crypto.randomUUID()}/${stagedFile.name}`;
      const { error: upErr } = await supabase.storage
        .from("chat-attachments")
        .upload(path, stagedFile, {
          contentType: stagedFile.type || undefined,
        });
      if (upErr) {
        setError(upErr.message);
        setSending(false);
        return;
      }
      payload = {
        ...payload,
        attachment_path: path,
        attachment_kind: attachmentKindFromMime(stagedFile.type || ""),
        attachment_mime: stagedFile.type || null,
        attachment_name: stagedFile.name,
        attachment_size: stagedFile.size,
      };
    }

    const { error: insErr } = await supabase.from("messages").insert(payload);
    if (insErr) {
      setError(insErr.message);
    } else {
      setDraft("");
      setStagedFile(null);
      lastTypingSentRef.current = 0;
    }
    setSending(false);
  }

  // === REACTIONS ===

  const reactionsByMessage = useMemo(() => {
    const m = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const arr = m.get(r.message_id) ?? [];
      arr.push(r);
      m.set(r.message_id, arr);
    }
    return m;
  }, [reactions]);

  async function toggleReaction(messageId: string, emoji: string) {
    const supabase = createClient();
    const mine = reactions.find(
      (r) => r.message_id === messageId && r.user_id === meId,
    );
    if (mine?.emoji === emoji) {
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", meId);
    } else if (mine) {
      await supabase
        .from("message_reactions")
        .update({ emoji })
        .eq("message_id", messageId)
        .eq("user_id", meId);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: meId,
        emoji,
      });
    }
    setPaletteForMessage(null);
  }

  // === TYPING (received → display) ===

  const activeTypers = useMemo(() => {
    const cutoff = Date.now() - TYPING_DISPLAY_MS;
    const out: { userId: string; displayName: string }[] = [];
    for (const [userId, info] of typingMap) {
      if (info.lastReceivedAt > cutoff) {
        out.push({ userId, displayName: info.displayName });
      }
    }
    return out;
  }, [typingMap]);

  const typingLine = useMemo(() => {
    if (activeTypers.length === 0) return null;
    if (activeTypers.length === 1)
      return `${activeTypers[0].displayName} is typing…`;
    if (activeTypers.length === 2)
      return `${activeTypers[0].displayName} and ${activeTypers[1].displayName} are typing…`;
    return "Several people are typing…";
  }, [activeTypers]);

  useEffect(() => {
    console.log("[typing] status changed", {
      conversationId,
      typingLine,
      activeTypers,
      at: new Date().toISOString(),
    });
  }, [typingLine, activeTypers, conversationId]);

  // === READ RECEIPTS (1:1) ===

  // For 1:1 only. The smallest last_read_at across other members.
  const othersMinLastRead = useMemo(() => {
    if (isGroup) return null;
    let min: string | null = null;
    for (const v of othersLastRead.values()) {
      if (v === null) return null; // someone never read — block "blue tick"
      if (min === null || v < min) min = v;
    }
    return min;
  }, [othersLastRead, isGroup]);

  function ticksFor(m: Message): "sent" | "read" | null {
    if (isGroup) return null;
    if (m.sender_id !== meId) return null;
    if (!othersMinLastRead) return "sent";
    return othersMinLastRead >= m.created_at ? "read" : "sent";
  }

  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">{title}</h2>
          {!isGroup && counterpartId ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PresenceDot
                online={counterpartOnline}
                lastSeenAt={counterpartLastSeenAt}
              />
              {counterpartOnline
                ? "online"
                : counterpartLastSeenAt
                  ? `last seen ${formatLastSeen(counterpartLastSeenAt)}`
                  : "offline"}
            </span>
          ) : null}
        </div>
        {isGroup ? (
          <Link
            href={`/chats/${conversationId}/info`}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Group info
          </Link>
        ) : null}
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-6 py-4"
        aria-busy={loading}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages yet. Say hi.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => {
              const mine = m.sender_id === meId;
              const rxs = reactionsByMessage.get(m.id) ?? [];
              const grouped = groupReactions(rxs, meId);
              const tick = ticksFor(m);
              const isPaletteOpen = paletteForMessage === m.id;
              return (
                <li
                  key={m.id}
                  className={cn(
                    "group flex flex-col",
                    mine ? "items-end" : "items-start",
                  )}
                >
                  <div className="flex items-end gap-2">
                    {!mine ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPaletteForMessage((cur) =>
                            cur === m.id ? null : m.id,
                          )
                        }
                        className="invisible text-xs text-muted-foreground hover:text-foreground group-hover:visible"
                        aria-label="React"
                      >
                        +
                      </button>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm",
                        mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {m.attachment_path ? (
                        <AttachmentView m={m} mine={mine} />
                      ) : null}
                      {m.body ? (
                        <p
                          className={cn(
                            "whitespace-pre-wrap break-words",
                            m.attachment_path && "mt-2",
                          )}
                        >
                          {m.body}
                        </p>
                      ) : null}
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1 text-[10px] opacity-70",
                          mine ? "justify-end" : "",
                        )}
                      >
                        <span>
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {tick === "sent" ? <span aria-label="Sent">✓</span> : null}
                        {tick === "read" ? (
                          <span
                            aria-label="Read"
                            className="text-sky-300"
                          >
                            ✓✓
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {mine ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPaletteForMessage((cur) =>
                            cur === m.id ? null : m.id,
                          )
                        }
                        className="invisible text-xs text-muted-foreground hover:text-foreground group-hover:visible"
                        aria-label="React"
                      >
                        +
                      </button>
                    ) : null}
                  </div>

                  {grouped.length > 0 ? (
                    <div
                      className={cn(
                        "mt-1 flex flex-wrap gap-1",
                        mine ? "justify-end" : "",
                      )}
                    >
                      {grouped.map((g) => (
                        <button
                          key={g.emoji}
                          type="button"
                          onClick={() => toggleReaction(m.id, g.emoji)}
                          className={cn(
                            "rounded-full border bg-background px-2 py-0.5 text-xs",
                            g.mine ? "border-primary" : "border-border",
                          )}
                          aria-pressed={g.mine}
                        >
                          {g.emoji} {g.count}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {isPaletteOpen ? (
                    <div
                      className={cn(
                        "mt-1 flex gap-1 rounded-full border bg-background px-2 py-1 shadow-sm",
                        mine ? "self-end" : "self-start",
                      )}
                    >
                      {REACTION_EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => toggleReaction(m.id, e)}
                          className="rounded px-1.5 text-base hover:bg-muted"
                          aria-label={`React with ${e}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {typingLine ? (
        <div className="px-6 py-1 text-xs text-muted-foreground">
          {typingLine}
        </div>
      ) : null}

      <form
        onSubmit={send}
        className="flex flex-col gap-2 border-t px-4 py-3"
      >
        {stagedFile ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-xs">
            <span className="truncate">
              📎 {stagedFile.name}{" "}
              <span className="text-muted-foreground">
                ({humanSize(stagedFile.size)})
              </span>
            </span>
            <button
              type="button"
              onClick={clearStaged}
              className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Remove attachment"
            >
              ✕
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onPickFile}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Attach file"
          >
            📎
          </Button>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value.length > 0) {
                broadcastTyping(me.displayName);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            placeholder={
              stagedFile ? "Add a caption (optional)" : "Type a message"
            }
            className="min-h-9 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            disabled={
              sending || (draft.trim() === "" && stagedFile === null)
            }
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>

      {error ? (
        <p className="px-4 pb-2 text-xs text-red-500" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function AttachmentView({ m, mine }: { m: Message; mine: boolean }) {
  if (!m.attachment_path) return null;
  const url = publicUrlFor(m.attachment_path);
  const name = m.attachment_name ?? "attachment";
  const size = m.attachment_size ?? null;

  if (m.attachment_kind === "image") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-md"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          className="max-h-72 max-w-full rounded-md object-contain"
        />
      </a>
    );
  }
  if (m.attachment_kind === "audio") {
    return (
      <audio controls src={url} className="w-full max-w-xs">
        <track kind="captions" />
      </audio>
    );
  }
  if (m.attachment_kind === "video") {
    return (
      <video controls src={url} className="max-h-72 max-w-full rounded-md">
        <track kind="captions" />
      </video>
    );
  }
  return (
    <a
      href={url}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-background/50",
        mine ? "border-primary-foreground/30" : "",
      )}
    >
      <span>📄</span>
      <span className="flex flex-col">
        <span className="truncate font-medium">{name}</span>
        {size !== null ? (
          <span className="text-xs opacity-70">{humanSize(size)}</span>
        ) : null}
      </span>
    </a>
  );
}

function groupReactions(
  rxs: Reaction[],
  meId: string,
): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of rxs) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.user_id === meId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({
    emoji,
    count: v.count,
    mine: v.mine,
  }));
}
