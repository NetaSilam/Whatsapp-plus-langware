import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { conversationMembers } from "@/lib/db/schema";

// Membership / role lookups shared by the conversation and group route handlers.
export async function getMembership(conversationId: string, userId: string) {
  const [row] = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function isMember(conversationId: string, userId: string) {
  return (await getMembership(conversationId, userId)) !== null;
}

export async function isAdmin(conversationId: string, userId: string) {
  return (await getMembership(conversationId, userId))?.role === "admin";
}
