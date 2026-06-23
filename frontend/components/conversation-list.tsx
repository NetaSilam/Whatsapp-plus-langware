"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  PresenceDot,
  formatLastSeen,
  useOnlineSet,
} from "@/components/online-provider";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type ConversationItem = {
  id: string;
  isGroup: boolean;
  title: string | null;
  counterpartId: string | null;
  counterpartName: string | null;
  counterpartLastSeenAt: string | null;
  lastBody: string | null;
  lastAttachmentName: string | null;
  lastAt: string | null;
};

export function ConversationList({ meId }: { meId: string }) {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const online = useOnlineSet();

  const load = useCallback(async () => {
    const supabase = createClient();

    const { data: convs, error } = await supabase
      .from("conversations")
      .select("id, is_group, title, created_at")
      .order("created_at", { ascending: false });

    if (error || !convs) {
      setItems([]);
      setLoading(false);
      return;
    }

    const ids = convs.map((c) => c.id);
    const { data: memberRows } = ids.length
      ? await supabase
          .from("conversation_members")
          .select(
            "conversation_id, user_id, profiles(display_name, last_seen_at)",
          )
          .in("conversation_id", ids)
          .neq("user_id", meId)
      : { data: [] };

    type ProfileLike =
      | { display_name?: string; last_seen_at?: string | null }
      | { display_name?: string; last_seen_at?: string | null }[]
      | null;

    const counterpartByConv = new Map<
      string,
      { id: string; name: string; lastSeenAt: string | null }
    >();
    for (const row of memberRows ?? []) {
      const r = row as {
        conversation_id: string;
        user_id: string;
        profiles?: ProfileLike;
      };
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      if (p && !counterpartByConv.has(r.conversation_id)) {
        counterpartByConv.set(r.conversation_id, {
          id: r.user_id,
          name: p.display_name ?? "Unknown",
          lastSeenAt: p.last_seen_at ?? null,
        });
      }
    }

    const { data: lastMsgs } = ids.length
      ? await supabase
          .from("messages")
          .select("conversation_id, body, attachment_name, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] };

    const lastByConv = new Map<
      string,
      {
        body: string | null;
        attachment_name: string | null;
        created_at: string;
      }
    >();
    for (const m of lastMsgs ?? []) {
      if (!lastByConv.has(m.conversation_id)) {
        lastByConv.set(m.conversation_id, {
          body: m.body,
          attachment_name: m.attachment_name,
          created_at: m.created_at,
        });
      }
    }

    const merged: ConversationItem[] = convs.map((c) => {
      const cp = counterpartByConv.get(c.id) ?? null;
      return {
        id: c.id,
        isGroup: c.is_group,
        title: c.title,
        counterpartId: cp?.id ?? null,
        counterpartName: cp?.name ?? null,
        counterpartLastSeenAt: cp?.lastSeenAt ?? null,
        lastBody: lastByConv.get(c.id)?.body ?? null,
        lastAttachmentName: lastByConv.get(c.id)?.attachment_name ?? null,
        lastAt: lastByConv.get(c.id)?.created_at ?? c.created_at,
      };
    });

    merged.sort((a, b) =>
      (b.lastAt ?? "").localeCompare(a.lastAt ?? ""),
    );

    setItems(merged);
    setLoading(false);
  }, [meId]);

  useEffect(() => {
    load();

    const supabase = createClient();
    const channel = supabase
      .channel("conversation-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No conversations yet. Hit “+ New chat” to start one.
      </p>
    );
  }

  return (
    <ul>
      {items.map((c) => {
        const label =
          c.title ?? c.counterpartName ?? (c.isGroup ? "Group" : "Direct chat");
        const isActive = activeId === c.id;
        const isOnline = c.counterpartId
          ? online.has(c.counterpartId)
          : false;
        return (
          <li key={c.id}>
            <Link
              href={`/chats/${c.id}`}
              className={cn(
                "block border-b px-4 py-3 hover:bg-muted",
                isActive && "bg-muted",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                  {!c.isGroup && c.counterpartId ? (
                    <PresenceDot
                      online={isOnline}
                      lastSeenAt={c.counterpartLastSeenAt}
                    />
                  ) : null}
                  <span className="truncate">{label}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.lastAt ? formatRelative(c.lastAt) : ""}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {!c.isGroup && c.counterpartId
                  ? isOnline
                    ? "Online · "
                    : c.counterpartLastSeenAt
                      ? `Last seen ${formatLastSeen(c.counterpartLastSeenAt)} · `
                      : ""
                  : ""}
                {previewFor(c)}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function previewFor(c: ConversationItem): string {
  if (c.lastBody && c.lastAttachmentName) {
    return `📎 ${c.lastBody}`;
  }
  if (c.lastBody) return c.lastBody;
  if (c.lastAttachmentName) return `📎 ${c.lastAttachmentName}`;
  return "No messages yet";
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
}
