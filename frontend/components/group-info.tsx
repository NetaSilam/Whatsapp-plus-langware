"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Member = { userId: string; displayName: string };

export function GroupInfo({
  conversationId,
  title,
  createdBy,
  meId,
  initialMembers,
}: {
  conversationId: string;
  title: string;
  createdBy: string;
  meId: string;
  initialMembers: Member[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [candidates, setCandidates] = useState<
    { id: string; display_name: string }[]
  >([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iAmCreator = createdBy === meId;

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("conversation_members")
      .select("user_id, profiles(display_name)")
      .eq("conversation_id", conversationId);
    type ProfileLike =
      | { display_name?: string }
      | { display_name?: string }[]
      | null;
    const next = (data ?? []).map((row) => {
      const profiles = (row as { profiles?: ProfileLike }).profiles;
      const name = Array.isArray(profiles)
        ? profiles[0]?.display_name
        : profiles?.display_name;
      return { userId: row.user_id, displayName: name ?? "Unknown" };
    });
    setMembers(next);
  }, [conversationId]);

  async function openPicker() {
    setPickerOpen(true);
    setPickerLoading(true);
    const supabase = createClient();
    const existing = new Set(members.map((m) => m.userId));
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .order("display_name");
    setCandidates((data ?? []).filter((p) => !existing.has(p.id)));
    setPickerLoading(false);
  }

  async function addMember(userId: string) {
    setPending(userId);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("conversation_members")
      .insert({ conversation_id: conversationId, user_id: userId });
    if (error) {
      setError(error.message);
    } else {
      await reload();
      setCandidates((prev) => prev.filter((p) => p.id !== userId));
    }
    setPending(null);
  }

  async function removeMember(userId: string) {
    setPending(userId);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (error) {
      setError(error.message);
    } else {
      await reload();
    }
    setPending(null);
  }

  async function leave() {
    setPending(meId);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", meId);
    if (error) {
      setError(error.message);
      setPending(null);
      return;
    }
    router.push("/chats");
    router.refresh();
  }

  // Auto-refresh members when realtime fires (cheap: any message insert in
  // any conversation; we only re-fetch this one).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`group-info:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, reload]);

  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-xs text-muted-foreground">Group settings</p>
        </div>
        <Button asChild variant="ghost">
          <Link href={`/chats/${conversationId}`}>Back to chat</Link>
        </Button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Members ({members.length})
            </h3>
            {iAmCreator ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={openPicker}
                disabled={pickerOpen}
              >
                Add member
              </Button>
            ) : null}
          </div>
          <ul className="space-y-1 rounded-md border">
            {members.map((m) => {
              const isMe = m.userId === meId;
              const isCreator = m.userId === createdBy;
              const canRemove = iAmCreator && !isMe;
              return (
                <li
                  key={m.userId}
                  className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <div>
                    <span>{m.displayName}</span>
                    {isMe ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (you)
                      </span>
                    ) : null}
                    {isCreator ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        creator
                      </span>
                    ) : null}
                  </div>
                  {canRemove ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending === m.userId}
                      onClick={() => removeMember(m.userId)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {pickerOpen && iAmCreator ? (
          <section className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Add a member</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPickerOpen(false)}
              >
                Close
              </Button>
            </div>
            {pickerLoading ? (
              <p className="text-sm text-muted-foreground">Loading users…</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Everyone is already a member.
              </p>
            ) : (
              <ul className="space-y-1">
                {candidates.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addMember(p.id)}
                      disabled={pending === p.id}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60",
                      )}
                    >
                      <span>{p.display_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {pending === p.id ? "Adding…" : "Add"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {error ? (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        ) : null}

        <section>
          <Button
            variant="destructive"
            onClick={leave}
            disabled={pending === meId}
          >
            {pending === meId ? "Leaving…" : "Leave group"}
          </Button>
        </section>
      </div>
    </>
  );
}
