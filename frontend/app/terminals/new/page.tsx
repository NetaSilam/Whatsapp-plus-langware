"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type ProfileRow = { id: string; display_name: string };

export default function NewTerminalPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) {
        router.push("/login");
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .neq("id", me.user.id)
        .order("display_name");
      if (error) {
        setError(error.message);
      } else {
        setProfiles(data ?? []);
      }
      setLoading(false);
    })();
  }, [router]);

  const canSubmit = useMemo(
    () => title.trim().length > 0 && picked.size > 0 && !submitting,
    [title, picked, submitting],
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_terminal", {
      title: title.trim(),
      member_ids: Array.from(picked),
    });
    if (error || !data) {
      setError(error?.message ?? "Could not create terminal");
      setSubmitting(false);
      return;
    }
    router.push(`/terminals/${data}`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium">New terminal</h2>
          <p className="text-sm text-muted-foreground">
            Anyone you pick can read the shell output and type commands.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/terminals">Cancel</Link>
        </Button>
      </header>

      <form onSubmit={onSubmit} className="max-w-md space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Terminal title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pair debugging"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Share with</Label>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading users…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other users yet.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1">
              {profiles.map((p) => {
                const isPicked = picked.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted",
                        isPicked && "bg-muted",
                      )}
                    >
                      <span>{p.display_name}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex h-4 w-4 items-center justify-center rounded border text-xs",
                          isPicked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "",
                        )}
                      >
                        {isPicked ? "✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {picked.size} selected
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={!canSubmit} className="w-full">
          {submitting ? "Creating…" : "Create terminal"}
        </Button>
      </form>
    </div>
  );
}
