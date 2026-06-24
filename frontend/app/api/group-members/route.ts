import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { conversationMembers, profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/conversations";

// POST /api/group-members  { conversationId, userId }  — add a member (admin).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { conversationId, userId } = await req.json().catch(() => ({}));
  if (!conversationId || !userId) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (!(await isAdmin(conversationId, user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const [exists] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  await db
    .insert(conversationMembers)
    .values({ conversationId, userId, role: "member" })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/group-members  { conversationId, userId }  — remove (admin).
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { conversationId, userId } = await req.json().catch(() => ({}));
  if (!conversationId || !userId) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (!(await isAdmin(conversationId, user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  await db
    .delete(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );
  return NextResponse.json({ ok: true });
}
