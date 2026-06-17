import { create } from "zustand";

import type { Conversation, Message, ReceiptStatus, User } from "./types";

type State = {
  me: User | null;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  online: Record<string, boolean>;

  setMe: (u: User | null) => void;
  setConversations: (c: Conversation[]) => void;
  setMessages: (convId: string, m: Message[]) => void;
  addMessage: (m: Message) => void;
  applyAggregates: (convId: string, aggregates: Record<string, ReceiptStatus>) => void;
  clearUnread: (convId: string) => void;
  setOnline: (ids: string[]) => void;
};

export const useStore = create<State>((set) => ({
  me: null,
  conversations: [],
  messages: {},
  online: {},

  setMe: (me) => set({ me }),
  setConversations: (conversations) => set({ conversations }),

  setMessages: (convId, m) =>
    set((s) => ({ messages: { ...s.messages, [convId]: m } })),

  addMessage: (m) =>
    set((s) => {
      const list = s.messages[m.conversation_id] ?? [];
      // Reconcile an optimistic message by client_msg_id, else dedupe by id.
      let next: Message[];
      const optimisticIdx = m.client_msg_id
        ? list.findIndex((x) => x.client_msg_id === m.client_msg_id)
        : -1;
      if (optimisticIdx >= 0) {
        next = [...list];
        next[optimisticIdx] = m;
      } else if (list.some((x) => x.id === m.id)) {
        next = list.map((x) => (x.id === m.id ? m : x));
      } else {
        next = [...list, m];
      }
      return { messages: { ...s.messages, [m.conversation_id]: next } };
    }),

  applyAggregates: (convId, aggregates) =>
    set((s) => {
      const list = s.messages[convId];
      if (!list) return s;
      const next = list.map((m) =>
        aggregates[m.id] ? { ...m, status: aggregates[m.id] } : m,
      );
      return { messages: { ...s.messages, [convId]: next } };
    }),

  clearUnread: (convId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, unread: 0 } : c,
      ),
    })),

  setOnline: (ids) => set({ online: Object.fromEntries(ids.map((id) => [id, true])) }),
}));
