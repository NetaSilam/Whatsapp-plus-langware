import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  conversation,
  conversationMembers,
  groups,
  messages,
  profiles,
} from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "attachments";

// GET /api/conversations — my conversations, each with a display title (group
// name, or the other participant for a DM) and a last-message preview.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await db
    .select({
      conversationId: conversationMembers.conversationId,
      type: conversation.type,
    })
    .from(conversationMembers)
    .innerJoin(
      conversation,
      eq(conversation.id, conversationMembers.conversationId),
    )
    .where(eq(conversationMembers.userId, user.id));

  const ids = memberships.map((m) => m.conversationId);
  if (ids.length === 0) return NextResponse.json([]);

  const typeByConv = new Map(memberships.map((m) => [m.conversationId, m.type]));

  // DM peer (the single other participant).
  const others = await db
    .select({
      conversationId: conversationMembers.conversationId,
      userId: profiles.id,
      displayName: profiles.displayName,
      avatarPath: profiles.avatarPath,
    })
    .from(conversationMembers)
    .innerJoin(profiles, eq(profiles.id, conversationMembers.userId))
    .where(
      and(
        inArray(conversationMembers.conversationId, ids),
        ne(conversationMembers.userId, user.id),
      ),
    );

  // Group names + avatars.
  const groupRows = await db
    .select({ conversationId: groups.conversationId, name: groups.name, avatarPath: groups.avatarPath })
    .from(groups)
    .where(inArray(groups.conversationId, ids));

  // Last-message preview per conversation (newest first, take the head).
  const msgs = await db
    .select({
      conversationId: messages.conversationId,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .orderBy(desc(messages.createdAt));

  const peerByConv = new Map(others.map((o) => [o.conversationId, o]));
  const groupByConv = new Map(groupRows.map((g) => [g.conversationId, g]));
  const lastByConv = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) {
    if (!lastByConv.has(m.conversationId)) lastByConv.set(m.conversationId, m);
  }

  // Collect avatar paths that need signed URLs.
  const admin = createAdminClient();
  async function signedUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  }

  const result = await Promise.all(
    ids
      .map((id) => {
        const type = typeByConv.get(id) ?? "dm";
        const peer = peerByConv.get(id);
        const group = groupByConv.get(id);
        const last = lastByConv.get(id);
        const title =
          type === "group"
            ? (group?.name ?? "Group")
            : (peer?.displayName ?? "Conversation");
        const avatarPath = type === "group" ? group?.avatarPath : peer?.avatarPath;
        return { id, type, title, avatarPath: avatarPath ?? null, lastMessage: last ? { body: last.body, createdAt: last.createdAt } : null };
      })
      .sort((a, b) => {
        const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return bt - at;
      })
      .map(async (c) => {
        const { avatarPath, ...rest } = c;
        return { ...rest, avatarUrl: await signedUrl(avatarPath) };
      }),
  );

  return NextResponse.json(result);
}

// POST /api/conversations  { peerUserId }  — find or create a DM with a user.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { peerUserId } = await req.json().catch(() => ({}));
  if (!peerUserId || peerUserId === user.id) {
    return NextResponse.json({ error: "Invalid peerUserId" }, { status: 400 });
  }

  const peer = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, peerUserId))
    .limit(1);
  if (peer.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Reuse an existing DM if these two already share one.
  const mine = await db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .innerJoin(
      conversation,
      eq(conversation.id, conversationMembers.conversationId),
    )
    .where(
      and(
        eq(conversationMembers.userId, user.id),
        eq(conversation.type, "dm"),
      ),
    );
  const theirs = await db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, peerUserId));
  const theirSet = new Set(theirs.map((r) => r.id));
  const shared = mine.find((r) => theirSet.has(r.id));
  if (shared) return NextResponse.json({ id: shared.id });

  const id = await db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversation)
      .values({ type: "dm", createdBy: user.id })
      .returning({ id: conversation.id });
    await tx.insert(conversationMembers).values([
      { conversationId: conv.id, userId: user.id, role: "member" },
      { conversationId: conv.id, userId: peerUserId, role: "member" },
    ]);
    return conv.id;
  });

  return NextResponse.json({ id }, { status: 201 });
}
