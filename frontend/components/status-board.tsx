"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmojiPickerButton } from "@/components/emoji-picker-button";

type Status = {
  id: string;
  userId: string;
  displayName: string;
  type: "text" | "image";
  body: string | null;
  mediaUrl: string | null;
  createdAt: string;
  expiresAt: string;
};

type Group = {
  userId: string;
  displayName: string;
  statuses: Status[]; // oldest first
  latestAt: string;
};

function groupByUser(feed: Status[]): Group[] {
  const map = new Map<string, Group>();
  // feed is newest-first from API; we iterate and prepend to keep oldest-first within group
  for (let i = feed.length - 1; i >= 0; i--) {
    const s = feed[i];
    if (!map.has(s.userId)) {
      map.set(s.userId, { userId: s.userId, displayName: s.displayName, statuses: [], latestAt: s.createdAt });
    }
    const g = map.get(s.userId)!;
    g.statuses.push(s);
    if (new Date(s.createdAt) > new Date(g.latestAt)) g.latestAt = s.createdAt;
  }
  // sort groups by most-recent status descending
  return [...map.values()].sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

export function StatusBoard({ currentUserId }: { currentUserId: string }) {
  const [feed, setFeed] = useState<Status[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/status");
    if (res.ok) setFeed(await res.json());
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (file && !file.type.startsWith("image/")) {
      setFileError("Only image files are allowed.");
      return;
    }
    setFileError("");
    if (posting || (!text.trim() && !file)) return;
    setPosting(true);
    const fd = new FormData();
    if (text.trim()) fd.append("body", text.trim());
    if (file) fd.append("file", file);
    const res = await fetch("/api/status", { method: "POST", body: fd });
    setPosting(false);
    if (res.ok) {
      setText("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    }
  }

  async function deleteStatus(id: string) {
    await fetch("/api/status", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  function startEdit(s: Status) {
    setEditingId(s.id);
    setEditText(s.body ?? "");
  }

  async function saveEdit(id: string) {
    await fetch("/api/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, body: editText }),
    });
    setEditingId(null);
    load();
  }

  const groups = groupByUser(feed);

  return (
    <div className="grid gap-6">
      {/* Post form */}
      <form onSubmit={post} className="grid gap-3 rounded-md border p-4">
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share a status update…"
          />
          <EmojiPickerButton onEmoji={(e) => setText((t) => t + e)} direction="bottom" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="grid gap-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="text-sm"
              onChange={() => setFileError("")}
            />
            {fileError && <p className="text-xs text-red-500">{fileError}</p>}
          </div>
          <Button type="submit" disabled={posting}>{posting ? "Posting…" : "Post status"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Statuses disappear after 24 hours.</p>
      </form>

      {/* Feed grouped by user */}
      <div className="grid gap-3">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">No active statuses. Be the first to post one.</p>
        )}
        {groups.map((group) => (
          <div key={group.userId} className="overflow-hidden rounded-md border">
            {/* User header */}
            <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold">
                {group.displayName[0]?.toUpperCase()}
              </div>
              <span className="font-medium">{group.displayName}</span>
              <time className="ml-auto text-xs text-muted-foreground">
                {new Date(group.latestAt).toLocaleString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </div>

            {/* Statuses for this user */}
            <div className="divide-y">
              {group.statuses.map((s) => (
                <div key={s.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <time className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                    {s.userId === currentUserId && (
                      <div className="flex items-center gap-2">
                        {/* Allow editing text body on any status (text or image caption) */}
                        {(s.type === "text" || s.body) && (
                          <button
                            onClick={() => startEdit(s)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => deleteStatus(s.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {editingId === s.id ? (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                      />
                      <Button size="sm" onClick={() => saveEdit(s.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      {s.body && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{s.body}</p>
                      )}
                      {s.type === "image" && s.mediaUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.mediaUrl}
                          alt="status"
                          className="mt-2 max-h-72 rounded-md border object-contain"
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
