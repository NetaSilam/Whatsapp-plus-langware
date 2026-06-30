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

export function StatusBoard({ currentUserId }: { currentUserId: string }) {
  const [feed, setFeed] = useState<Status[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
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

  return (
    <div className="grid gap-6">
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
          <input ref={fileRef} type="file" accept="image/*" className="text-sm" />
          <Button type="submit" disabled={posting}>{posting ? "Posting…" : "Post status"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Statuses disappear after 24 hours.</p>
      </form>

      <div className="grid gap-3">
        {feed.length === 0 && (
          <p className="text-sm text-muted-foreground">No active statuses. Be the first to post one.</p>
        )}
        {feed.map((s) => (
          <div key={s.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{s.displayName}</span>
              <div className="flex items-center gap-2 shrink-0">
                <time className="text-xs text-muted-foreground">
                  {new Date(s.createdAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                </time>
                {s.userId === currentUserId && (
                  <>
                    {s.type === "text" && (
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
                  </>
                )}
              </div>
            </div>

            {editingId === s.id ? (
              <div className="mt-2 flex gap-2">
                <Input value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                <Button size="sm" onClick={() => saveEdit(s.id)}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </div>
            ) : (
              <>
                {s.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{s.body}</p>}
                {s.type === "image" && s.mediaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.mediaUrl} alt="status" className="mt-2 max-h-72 rounded-md border" />
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
