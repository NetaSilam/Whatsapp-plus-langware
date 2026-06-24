import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// TypeScript mirror of the canonical SQL schema in supabase/migrations/.
// After changing a migration, update this mirror (or regenerate it from the
// live local DB with `npm run db:pull`).
//
// Tables are added per phase. Phase 1: profiles.

// One row per auth.users account, holding app-facing identity fields.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarPath: text("avatar_path"),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
