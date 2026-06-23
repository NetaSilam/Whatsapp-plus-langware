import {
  bigint,
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// TypeScript mirror of supabase/migrations/. Update this whenever a migration
// changes a table (or regenerate with `npm run db:pull`).

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  isGroup: boolean("is_group").notNull().default(false),
  title: text("title"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.conversationId, t.userId] }),
    userIdx: index("conversation_members_user_id_idx").on(t.userId),
  }),
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.userId] }),
    msgIdx: index("message_reactions_message_id_idx").on(t.messageId),
  }),
);

export const terminals = pgTable("terminals", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const terminalMembers = pgTable(
  "terminal_members",
  {
    terminalId: uuid("terminal_id")
      .notNull()
      .references(() => terminals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.terminalId, t.userId] }),
    userIdx: index("terminal_members_user_id_idx").on(t.userId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    body: text("body"),
    attachmentPath: text("attachment_path"),
    attachmentKind: text("attachment_kind"),
    attachmentMime: text("attachment_mime"),
    attachmentName: text("attachment_name"),
    attachmentSize: bigint("attachment_size", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    convCreatedIdx: index("messages_conversation_id_created_at_idx").on(
      t.conversationId,
      t.createdAt,
    ),
  }),
);
