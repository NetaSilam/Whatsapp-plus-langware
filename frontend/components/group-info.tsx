"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmojiPickerButton } from "@/components/emoji-picker-button";

type Member = { id: string; displayName: string; role: string };
type GroupInfoData = {
  conversationId: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  members: Member[];
};
type UserHit = { id: string; displayName: string; email: string };

export function GroupInfo({ conversationId, currentUserId }: { conversationId: string; currentUserId: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<GroupInfoData | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  async function load() {
    const res = await fetch(`/api/groups?conversationId=${encodeURIComponent(conversationId)}`);
    if (res.ok) {
      const data = (await res.json()) as GroupInfoData;
      setInfo(data);
      setName(data.name);
      setDescription(data.description ?? "");
    }
  }
  useEffect(() => { load(); }, [conversationId]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); return; }
    const s = ++seq.current;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
      if (s !== seq.current) return;
      setHits(res.ok ? await res.json() : []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function saveInfo() {
    setSaving(true);
    const fd = new FormData();
    fd.append("conversationId", conversationId);
    if (name.trim()) fd.append("name", name.trim());
    fd.append("description", description);
    const file = avatarRef.current?.files?.[0];
    if (file) fd.append("file", file);
    await fetch("/api/groups", { method: "PATCH", body: fd });
    if (avatarRef.current) avatarRef.current.value = "";
    setSaving(false);
    load();
  }

  async function addMember(userId: string) {
    await fetch("/api/group-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, userId }),
    });
    setQuery(""); setHits([]);
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

  async function leaveGroup() {
    await fetch("/api/group-members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, userId: currentUserId }),
    });
    router.push("/chats");
  }

  async function deleteGroup() {
    if (!confirm("Delete this group for everyone? This cannot be undone.")) return;
    setDeleting(true);
    await fetch("/api/groups", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
    router.push("/chats");
  }

  if (!info) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const memberIds = new Set(info.members.map((m) => m.id));

  return (
    <div className="grid gap-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        {info.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.avatarUrl} alt="group" className="h-20 w-20 rounded-full border object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border bg-muted text-2xl font-semibold">
            {info.name[0]?.toUpperCase()}
          </div>
        )}
        {info.isAdmin && (
          <label className="cursor-pointer text-xs text-primary underline">
            Change photo
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={saveInfo} />
          </label>
        )}
      </div>

      {/* Name + description */}
      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label>Group name</Label>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!info.isAdmin} />
            {info.isAdmin && <EmojiPickerButton onEmoji={(e) => setName((n) => n + e)} direction="bottom" />}
            {info.isAdmin && (
              <Button onClick={saveInfo} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-1">
          <Label>Description</Label>
          <div className="flex gap-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this group about?"
              disabled={!info.isAdmin}
            />
            {info.isAdmin && <EmojiPickerButton onEmoji={(e) => setDescription((d) => d + e)} direction="bottom" />}
            {info.isAdmin && (
              <Button onClick={saveInfo} disabled={saving}>
                {saving ? "…" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="grid gap-2">
        <h2 className="text-sm font-medium">Members ({info.members.length})</h2>
        <div className="grid gap-1">
          {info.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>
                {m.displayName}
                {m.role === "admin" && <span className="ml-2 text-xs text-muted-foreground">admin</span>}
              </span>
              {info.isAdmin && m.role !== "admin" && m.id !== currentUserId && (
                <Button variant="ghost" size="sm" onClick={() => removeMember(m.id)}>Remove</Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add member (admin only) */}
      {info.isAdmin && (
        <div className="grid gap-2">
          <h2 className="text-sm font-medium">Add member</h2>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" />
          {hits.length > 0 && (
            <div className="grid gap-1 rounded-md border p-1">
              {hits.filter((u) => !memberIds.has(u.id)).map((u) => (
                <button
                  key={u.id}
                  onClick={() => addMember(u.id)}
                  className="grid rounded px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span>{u.displayName}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Danger zone */}
      <div className="grid gap-2 border-t pt-4">
        {!info.isAdmin && (
          <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={leaveGroup}>
            Leave group
          </Button>
        )}
        {info.isAdmin && (
          <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={deleteGroup} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete group"}
          </Button>
        )}
      </div>
    </div>
  );
}
