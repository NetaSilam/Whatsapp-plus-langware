import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { terminals, terminalMembers } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";

// POST /api/terminals/share  { terminalId, userId }  — invite a user.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { terminalId, userId } = await req.json().catch(() => ({}));
  if (!terminalId || !userId) {
    return NextResponse.json({ error: "terminalId and userId required" }, { status: 400 });
  }

  // Only the owner can invite.
  const [terminal] = await db
    .select({ id: terminals.id })
    .from(terminals)
    .where(and(eq(terminals.id, terminalId), eq(terminals.ownerId, user.id)))
    .limit(1);
  if (!terminal) {
    return NextResponse.json({ error: "Terminal not found or not owner" }, { status: 403 });
  }

  // Upsert — idempotent if already invited.
  await db
    .insert(terminalMembers)
    .values({ terminalId, userId })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}

// DELETE /api/terminals/share  { terminalId, userId }  — revoke access.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { terminalId, userId } = await req.json().catch(() => ({}));
  if (!terminalId || !userId) {
    return NextResponse.json({ error: "terminalId and userId required" }, { status: 400 });
  }

  const [terminal] = await db
    .select({ id: terminals.id })
    .from(terminals)
    .where(and(eq(terminals.id, terminalId), eq(terminals.ownerId, user.id)))
    .limit(1);
  if (!terminal) {
    return NextResponse.json({ error: "Terminal not found or not owner" }, { status: 403 });
  }

  await db
    .delete(terminalMembers)
    .where(and(eq(terminalMembers.terminalId, terminalId), eq(terminalMembers.userId, userId)));

  return NextResponse.json({ ok: true });
}
