"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Terminal = { id: string; name: string; status: string; createdAt: string };
type SharedTerminal = Terminal & { ownerName: string };

export function TerminalList() {
  const router = useRouter();
  const [owned, setOwned] = useState<Terminal[]>([]);
  const [shared, setShared] = useState<SharedTerminal[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/terminals");
    if (!res.ok) return;
    const data = await res.json();
    setOwned(data.owned ?? []);
    setShared(data.shared ?? []);
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    const res = await fetch("/api/terminals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || "Terminal" }),
    });
    setCreating(false);
    if (res.ok) {
      const t = await res.json();
      router.push(`/terminals/${t.id}`);
    }
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={create} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New terminal name (e.g. build, logs)"
        />
        <Button type="submit" disabled={creating}>New terminal</Button>
      </form>

      <div className="grid gap-1">
        <h2 className="text-sm font-medium text-muted-foreground">My terminals</h2>
        {owned.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No terminals yet. Create one above to open a live shell.
          </p>
        )}
        {owned.map((t) => (
          <Link
            key={t.id}
            href={`/terminals/${t.id}`}
            className="flex items-center justify-between rounded-md border p-3 hover:bg-accent"
          >
            <span className="font-medium">{t.name}</span>
            <span className="text-xs text-muted-foreground">{t.status}</span>
          </Link>
        ))}
      </div>

      {shared.length > 0 && (
        <div className="grid gap-1">
          <h2 className="text-sm font-medium text-muted-foreground">Shared with me</h2>
          {shared.map((t) => (
            <Link
              key={t.id}
              href={`/terminals/${t.id}`}
              className="flex items-center justify-between rounded-md border p-3 hover:bg-accent"
            >
              <span className="grid">
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">by {t.ownerName}</span>
              </span>
              <span className="text-xs text-muted-foreground">{t.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
