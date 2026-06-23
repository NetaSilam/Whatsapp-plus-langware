"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type ProfileRow = { id: string; display_name: string };

export default function NewChatPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  async function start(otherId: string) {
    setPendingId(otherId);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc(
      "get_or_create_direct_conversation",
      { other_user: otherId },
    );
    if (error || !data) {
      setError(error?.message ?? "Could not start chat");
      setPendingId(null);
      return;
    }
    router.push(`/chats/${data}`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium">Start a new chat</h2>
          <p className="text-sm text-muted-foreground">
            Pick someone to chat with.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/chats">Cancel</Link>
        </Button>
      </header>

      {error ? (
        <p className="mb-4 text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No other users yet. Sign up a second account in another browser.
        </p>
      ) : (
        <ul className="max-w-md space-y-1">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => start(p.id)}
                disabled={pendingId !== null}
                className="flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm hover:bg-muted disabled:opacity-60"
              >
                <span>{p.display_name}</span>
                <span className="text-xs text-muted-foreground">
                  {pendingId === p.id ? "Opening…" : "Chat"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
