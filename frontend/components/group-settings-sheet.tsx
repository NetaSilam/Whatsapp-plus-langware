"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MoreVertical, Settings, ShieldCheck, UserMinus, UserPlus } from "lucide-react";

import { useApp } from "@/components/app-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Conversation, User } from "@/lib/types";

export function GroupSettingsSheet({ conversation }: { conversation: Conversation }) {
  const router = useRouter();
  const { refreshConversations } = useApp();
  const me = useStore((s) => s.me);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const iAmManager = conversation.my_role === "manager";
  const memberIds = new Set(conversation.members.map((m) => m.id));

  async function run(label: string, fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[group-settings] ${label} failed:`, e);
      setError(`${label} failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!adding) return;
    const t = setTimeout(() => {
      api
        .get<User[]>(`/api/users?search=${encodeURIComponent(search)}`)
        .then((us) => setCandidates(us.filter((u) => !memberIds.has(u.id))));
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, search, conversation.members.length]);

  function addMember(id: string) {
    return run("Add member", async () => {
      await api.post(`/api/conversations/${conversation.id}/members`, { user_ids: [id] });
      await refreshConversations();
      setSearch("");
    });
  }
  function promote(id: string) {
    return run("Promote", async () => {
      await api.post(`/api/conversations/${conversation.id}/members/${id}/promote`);
      await refreshConversations();
    });
  }
  function remove(id: string) {
    return run("Remove member", async () => {
      await api.del(`/api/conversations/${conversation.id}/members/${id}`);
      await refreshConversations();
    });
  }
  function leave() {
    return run("Leave group", async () => {
      await api.del(`/api/conversations/${conversation.id}/members/${me!.id}`);
      await refreshConversations();
      router.push("/chats");
    });
  }
  function deleteGroup() {
    return run("Delete group", async () => {
      await api.del(`/api/conversations/${conversation.id}`);
      await refreshConversations();
      router.push("/chats");
    });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Group info">
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <UserAvatar name={conversation.title} photoUrl={conversation.photo_url} isGroup />
            {conversation.title}
          </SheetTitle>
          <SheetDescription>
            {conversation.members.length} members ·{" "}
            {iAmManager ? "You are a manager" : "You are a member"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Members</span>
            {iAmManager && (
              <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
                <UserPlus className="mr-1 h-4 w-4" /> Add
              </Button>
            )}
          </div>

          {adding && (
            <div className="mb-3 rounded-md border p-2">
              <Input
                placeholder="Search people to add…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {candidates.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">No one to add</p>
                )}
                {candidates.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addMember(u.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <UserAvatar name={u.username} photoUrl={u.photo_url} className="h-8 w-8" />
                    <span className="truncate text-sm">{u.username}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="space-y-1">
            {conversation.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                <UserAvatar name={m.username} photoUrl={m.photo_url} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.username}
                    {m.id === me?.id && " (you)"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.phone}</p>
                </div>
                {m.role === "manager" && (
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> Manager
                  </Badge>
                )}
                {iAmManager && m.id !== me?.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {m.role !== "manager" && (
                        <DropdownMenuItem onClick={() => promote(m.id)}>
                          <ShieldCheck className="mr-2 h-4 w-4" /> Make manager
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => remove(m.id)}
                      >
                        <UserMinus className="mr-2 h-4 w-4" /> Remove from group
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 border-t p-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={leave}
            disabled={busy}
          >
            Leave group
          </Button>
          {iAmManager && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={deleteGroup}
              disabled={busy}
            >
              Delete group
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
