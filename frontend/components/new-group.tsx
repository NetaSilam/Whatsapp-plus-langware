"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmojiPickerButton } from "@/components/emoji-picker-button";

type UserHit = { id: string; displayName: string; email: string };

export function NewGroup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [selected, setSelected] = useState<UserHit[]>([]);
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);

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

  function add(u: UserHit) {
    if (!selected.some((s) => s.id === u.id)) setSelected([...selected, u]);
    setQuery("");
    setHits([]);
  }
  function remove(id: string) {
    setSelected(selected.filter((s) => s.id !== id));
  }

  async function create() {
    if (creating || !name.trim() || selected.length === 0) return;
    setCreating(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        memberIds: selected.map((s) => s.id),
      }),
    });
    setCreating(false);
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/chats/${id}`);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium">Group name</label>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Weekend plans"
          />
          <EmojiPickerButton onEmoji={(e) => setName((n) => n + e)} direction="bottom" />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((u) => (
            <button
              key={u.id}
              onClick={() => remove(u.id)}
              className="rounded-full bg-secondary px-3 py-1 text-xs"
            >
              {u.displayName} ✕
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <label className="text-sm font-medium">Add people</label>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
        />
        {hits.length > 0 && (
          <div className="grid gap-1 rounded-md border p-1">
            {hits.map((u) => (
              <button
                key={u.id}
                onClick={() => add(u)}
                className="grid rounded px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span>{u.displayName}</span>
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={create}
        disabled={creating || !name.trim() || selected.length === 0}
      >
        Create group
      </Button>
    </div>
  );
}
