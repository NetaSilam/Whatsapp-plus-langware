"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

const OnlineContext = createContext<Set<string>>(new Set());
const MeContext = createContext<{ id: string; displayName: string }>({
  id: "",
  displayName: "",
});

export function useOnlineSet() {
  return useContext(OnlineContext);
}

export function useMe() {
  return useContext(MeContext);
}

export function useIsOnline(userId: string | null | undefined) {
  const set = useOnlineSet();
  if (!userId) return false;
  return set.has(userId);
}

export function OnlineProvider({
  me,
  children,
}: {
  me: { id: string; displayName: string };
  children: React.ReactNode;
}) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  // Presence channel — every signed-in tab broadcasts itself; sync events
  // give us the union of currently-connected user ids.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("presence:online", {
      config: { presence: { key: me.id } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      setOnline(new Set(Object.keys(state)));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: me.id,
          display_name: me.displayName,
        });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me.id, me.displayName]);

  // Last-seen heartbeat — keeps profiles.last_seen_at fresh while we're
  // active so an "offline" peer can be shown a recent timestamp.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const beat = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", me.id);
    };

    void beat();
    const timer = setInterval(() => void beat(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [me.id]);

  const ctx = useMemo(() => online, [online]);

  return (
    <MeContext.Provider value={me}>
      <OnlineContext.Provider value={ctx}>{children}</OnlineContext.Provider>
    </MeContext.Provider>
  );
}

export function PresenceDot({
  online,
  lastSeenAt,
}: {
  online: boolean;
  lastSeenAt: string | null | undefined;
}) {
  if (online) {
    return (
      <span
        aria-label="Online"
        title="Online"
        className="inline-block size-2 rounded-full bg-emerald-500"
      />
    );
  }
  return (
    <span
      aria-label="Offline"
      title={
        lastSeenAt
          ? `Last seen ${formatLastSeen(lastSeenAt)}`
          : "Offline"
      }
      className="inline-block size-2 rounded-full bg-zinc-400"
    />
  );
}

export function formatLastSeen(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}
