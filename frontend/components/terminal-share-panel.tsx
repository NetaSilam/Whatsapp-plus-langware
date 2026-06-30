"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UserHit = { id: string; displayName: string; email: string };
type Member = { userId: string; displayName: string; email: string };

export function TerminalSharePanel({ terminalId }: { terminalId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const seq = useRef(0);

  async function loadMembers() {
    const res = await fetch(`/api/terminals/members?terminalId=${terminalId}`);
    if (res.ok) setMembers(await res.json());
  }

  useEffect(() => {
    if (open) loadMembers();
  }, [open]);

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

  async function invite(userId: string) {
    await fetch("/api/terminals/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminalId, userId }),
    });
    setQuery("");
    setHits([]);
    loadMembers();
  }

  async function revoke(userId: string) {
    await fetch("/api/terminals/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminalId, userId }),
    });
    loadMembers();
  }

  if (!open) {
    return (
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Share terminal
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border p-4 grid gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Share this terminal</span>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="grid gap-1">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people to invite…"
        />
        {hits.length > 0 && (
          <div className="rounded-md border grid gap-1 p-1">
            {hits.map((u) => (
              <button
                key={u.id}
                onClick={() => invite(u.id)}
                className="grid rounded px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span>{u.displayName}</span>
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {members.length > 0 && (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground font-medium">Invited</p>
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between rounded px-3 py-1.5 text-sm border">
              <span className="grid">
                <span>{m.displayName}</span>
                <span className="text-xs text-muted-foreground">{m.email}</span>
              </span>
              <button
                onClick={() => revoke(m.userId)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
      {members.length === 0 && (
        <p className="text-xs text-muted-foreground">No one invited yet.</p>
      )}
    </div>
  );
}
