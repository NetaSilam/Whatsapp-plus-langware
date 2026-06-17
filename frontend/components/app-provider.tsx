"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import type { Conversation, User } from "@/lib/types";

type AppContextValue = {
  refreshConversations: () => Promise<void>;
  supabase: ReturnType<typeof createClient>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient>>(undefined);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;

  const { me, setMe, setConversations, setOnline } = useStore();
  const [ready, setReady] = useState(false);

  const refreshConversations = useCallback(async () => {
    const convs = await api.get<Conversation[]>("/api/conversations");
    setConversations(convs);
    // Online-and-received => mark delivered so senders get the double check.
    for (const c of convs) {
      if (c.unread > 0) {
        api.post(`/api/conversations/${c.id}/delivered`).catch(() => {});
      }
    }
  }, [setConversations]);

  // Load session + initial data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await api.get<User>("/api/auth/me");
        if (cancelled) return;
        setMe(user);
        await refreshConversations();
        if (!cancelled) setReady(true);
      } catch {
        router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setMe, refreshConversations, router]);

  // Realtime: presence + per-user conversation notifications.
  useEffect(() => {
    if (!me) return;

    const presence = supabase.channel("presence:online", {
      config: { presence: { key: me.id } },
    });
    presence
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(presence.presenceState()));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") presence.track({ user_id: me.id });
      });

    const userCh = supabase.channel(`user:${me.id}`);
    const bump = () => refreshConversations();
    userCh
      .on("broadcast", { event: "conversation.updated" }, bump)
      .on("broadcast", { event: "conversation.created" }, bump)
      .subscribe();

    return () => {
      supabase.removeChannel(presence);
      supabase.removeChannel(userCh);
    };
  }, [me, supabase, setOnline, refreshConversations]);

  // Presence heartbeat -> keeps users.last_seen fresh.
  useEffect(() => {
    if (!me) return;
    const beat = () => api.post("/api/presence/heartbeat").catch(() => {});
    beat();
    const id = setInterval(beat, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [me]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ refreshConversations, supabase }}>
      {children}
    </AppContext.Provider>
  );
}
