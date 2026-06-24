import { and, eq, gt, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { conversationMembers, profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isMember } from "@/lib/conversations";

// Someone is considered "typing" if they pinged within this window.
const WINDOW_MS = 5000;

// POST /api/typing  { conversationId }  — refresh my "typing" timestamp.
// The client calls this (throttled) while the composer has focus/changes.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { conversationId } = await req.json().catch(() => ({}));
  if (!conversationId || !(await isMember(conversationId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await db
    .update(conversationMembers)
    .set({ lastTypingAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, user.id),
      ),
    );
  return NextResponse.json({ ok: true });
}

// GET /api/typing?conversationId=…  — other members currently typing.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";
  if (!conversationId || !(await isMember(conversationId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .select({
      userId: conversationMembers.userId,
      displayName: profiles.displayName,
    })
    .from(conversationMembers)
    .innerJoin(profiles, eq(profiles.id, conversationMembers.userId))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        ne(conversationMembers.userId, user.id),
        gt(conversationMembers.lastTypingAt, since),
      ),
    );
  return NextResponse.json(rows);
}
