"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function StatusBoard() {
  const [feed, setFeed] = useState<Status[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
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

  return (
    <div className="grid gap-6">
      <form onSubmit={post} className="grid gap-3 rounded-md border p-4">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share a status update…"
        />
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="text-sm"
          />
          <Button type="submit" disabled={posting}>
            {posting ? "Posting…" : "Post status"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Statuses disappear after 24 hours.
        </p>
      </form>

      <div className="grid gap-3">
        {feed.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No active statuses. Be the first to post one.
          </p>
        )}
        {feed.map((s) => (
          <div key={s.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{s.displayName}</span>
              <time className="text-xs text-muted-foreground">
                {new Date(s.createdAt).toLocaleString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </div>
            {s.body && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                {s.body}
              </p>
            )}
            {s.type === "image" && s.mediaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.mediaUrl}
                alt="status"
                className="mt-2 max-h-72 rounded-md border"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
