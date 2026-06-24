import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  conversation,
  conversationMembers,
  groups,
  profiles,
} from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isMember } from "@/lib/conversations";

// POST /api/groups  { name, memberIds[] }  — create a group conversation.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { name, memberIds } = await req.json().catch(() => ({}));
  const groupName = typeof name === "string" ? name.trim() : "";
  if (!groupName) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const others: string[] = Array.isArray(memberIds)
    ? [...new Set(memberIds.filter((m) => typeof m === "string" && m !== user.id))]
    : [];

  const conversationId = await db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversation)
      .values({ type: "group", createdBy: user.id })
      .returning({ id: conversation.id });
    await tx
      .insert(groups)
      .values({ conversationId: conv.id, name: groupName, createdBy: user.id });
    await tx.insert(conversationMembers).values([
      { conversationId: conv.id, userId: user.id, role: "admin" },
      ...others.map((id) => ({
        conversationId: conv.id,
        userId: id,
        role: "member",
      })),
    ]);
    return conv.id;
  });

  return NextResponse.json({ id: conversationId }, { status: 201 });
}

// GET /api/groups?conversationId=…  — group info (members + your role).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";
  if (!conversationId || !(await isMember(conversationId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [group] = await db
    .select({ name: groups.name, createdBy: groups.createdBy })
    .from(groups)
    .where(eq(groups.conversationId, conversationId))
    .limit(1);
  if (!group) {
    return NextResponse.json({ error: "Not a group" }, { status: 404 });
  }

  const members = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      role: conversationMembers.role,
    })
    .from(conversationMembers)
    .innerJoin(profiles, eq(profiles.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, conversationId));

  return NextResponse.json({
    conversationId,
    name: group.name,
    isAdmin: await isAdmin(conversationId, user.id),
    members,
  });
}

// PATCH /api/groups  { conversationId, name }  — rename (admin only).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { conversationId, name } = await req.json().catch(() => ({}));
  const newName = typeof name === "string" ? name.trim() : "";
  if (!conversationId || !newName) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (!(await isAdmin(conversationId, user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  await db
    .update(groups)
    .set({ name: newName })
    .where(eq(groups.conversationId, conversationId));
  return NextResponse.json({ ok: true });
}
