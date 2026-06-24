"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Terminal = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
};

export function TerminalList() {
  const router = useRouter();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/terminals");
    if (res.ok) setTerminals(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

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
    <div className="grid gap-4">
      <form onSubmit={create} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New terminal name (e.g. build, logs)"
        />
        <Button type="submit" disabled={creating}>
          New terminal
        </Button>
      </form>

      <div className="grid gap-1">
        {terminals.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No terminals yet. Create one above to open a live shell.
          </p>
        )}
        {terminals.map((t) => (
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
    </div>
  );
}
