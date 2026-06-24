"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Member = { id: string; displayName: string; role: string };
type GroupInfoData = {
  conversationId: string;
  name: string;
  isAdmin: boolean;
  members: Member[];
};
type UserHit = { id: string; displayName: string };

export function GroupInfo({ conversationId }: { conversationId: string }) {
  const [info, setInfo] = useState<GroupInfoData | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const seq = useRef(0);

  async function load() {
    const res = await fetch(
      `/api/groups?conversationId=${encodeURIComponent(conversationId)}`,
    );
    if (res.ok) {
      const data = (await res.json()) as GroupInfoData;
      setInfo(data);
      setName(data.name);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const s = ++seq.current;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
      if (s !== seq.current) return;
      setHits(res.ok ? await res.json() : []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function rename() {
    await fetch("/api/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, name: name.trim() }),
    });
    load();
  }
  async function addMember(userId: string) {
    await fetch("/api/group-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, userId }),
    });
    setQuery("");
    setHits([]);
    load();
  }
  async function removeMember(userId: string) {
    await fetch("/api/group-members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, userId }),
    });
    load();
  }

  if (!info) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const memberIds = new Set(info.members.map((m) => m.id));

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <label className="text-sm font-medium">Group name</label>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!info.isAdmin}
          />
          {info.isAdmin && (
            <Button onClick={rename} disabled={!name.trim()}>
              Rename
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <h2 className="text-sm font-medium">Members ({info.members.length})</h2>
        <div className="grid gap-1">
          {info.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <span>
                {m.displayName}
                {m.role === "admin" && (
                  <span className="ml-2 text-xs text-muted-foreground">admin</span>
                )}
              </span>
              {info.isAdmin && m.role !== "admin" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMember(m.id)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {info.isAdmin && (
        <div className="grid gap-2">
          <h2 className="text-sm font-medium">Add member</h2>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
          />
          {hits.length > 0 && (
            <div className="grid gap-1 rounded-md border p-1">
              {hits
                .filter((u) => !memberIds.has(u.id))
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addMember(u.id)}
                    className="rounded px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    {u.displayName}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
