"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, PenSquare, Users } from "lucide-react";

import { useApp } from "@/components/app-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Conversation, User } from "@/lib/types";
import { cn } from "@/lib/utils";

export function NewChatDialog() {
  const router = useRouter();
  const { refreshConversations } = useApp();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api.get<User[]>(`/api/users?search=${encodeURIComponent(search)}`).then(setUsers);
    }, 150);
    return () => clearTimeout(t);
  }, [open, search]);

  function reset() {
    setMode("direct");
    setSearch("");
    setSelected(new Set());
    setGroupName("");
  }

  async function startDirect(peerId: string) {
    setBusy(true);
    try {
      const conv = await api.post<Conversation>("/api/conversations/direct", { peer_id: peerId });
      await refreshConversations();
      setOpen(false);
      reset();
      router.push(`/chats/${conv.id}`);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function createGroup() {
    if (!groupName.trim() || selected.size === 0) return;
    setBusy(true);
    try {
      const conv = await api.post<Conversation>("/api/conversations/group", {
        name: groupName.trim(),
        member_ids: [...selected],
      });
      await refreshConversations();
      setOpen(false);
      reset();
      router.push(`/chats/${conv.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="New chat">
          <PenSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "direct" ? "New chat" : "New group"}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            variant={mode === "direct" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("direct")}
          >
            <PenSquare className="mr-1 h-4 w-4" /> Direct
          </Button>
          <Button
            variant={mode === "group" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("group")}
          >
            <Users className="mr-1 h-4 w-4" /> Group
          </Button>
        </div>

        {mode === "group" && (
          <Input
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}

        <Input
          placeholder="Search people…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {users.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No users found</p>
          )}
          {users.map((u) => {
            const isSel = selected.has(u.id);
            return (
              <button
                key={u.id}
                disabled={busy}
                onClick={() => (mode === "direct" ? startDirect(u.id) : toggle(u.id))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent",
                  isSel && "bg-accent",
                )}
              >
                <UserAvatar name={u.username} photoUrl={u.photo_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.username}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.phone}</p>
                </div>
                {mode === "group" && isSel && <Check className="h-4 w-4 text-emerald-600" />}
              </button>
            );
          })}
        </div>

        {mode === "group" && (
          <Button
            onClick={createGroup}
            disabled={busy || !groupName.trim() || selected.size === 0}
          >
            Create group ({selected.size})
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
