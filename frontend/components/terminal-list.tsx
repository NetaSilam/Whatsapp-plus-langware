"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type TerminalItem = {
  id: string;
  title: string;
  createdAt: string;
};

export function TerminalList() {
  const [items, setItems] = useState<TerminalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("terminals")
      .select("id, title, created_at")
      .order("created_at", { ascending: false });
    setItems(
      ((data as { id: string; title: string; created_at: string }[]) ?? []).map(
        (r) => ({ id: r.id, title: r.title, createdAt: r.created_at }),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="px-4 py-2 text-xs text-muted-foreground">Loading…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">
        No terminals yet.
      </p>
    );
  }
  return (
    <ul>
      {items.map((t) => (
        <li key={t.id}>
          <Link
            href={`/terminals/${t.id}`}
            className={cn(
              "block border-b px-4 py-2 text-sm hover:bg-muted",
              activeId === t.id && "bg-muted",
            )}
          >
            <span className="mr-2">⌨️</span>
            <span className="truncate">{t.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
