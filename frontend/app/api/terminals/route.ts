import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { terminals, terminalMembers, profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";

// GET /api/terminals — my terminals + terminals I was invited to.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await db
    .select({ id: terminals.id, name: terminals.name, status: terminals.status, createdAt: terminals.createdAt, role: terminals.ownerId })
    .from(terminals)
    .where(eq(terminals.ownerId, user.id))
    .orderBy(desc(terminals.createdAt));

  const shared = await db
    .select({
      id: terminals.id,
      name: terminals.name,
      status: terminals.status,
      createdAt: terminals.createdAt,
      ownerName: profiles.displayName,
    })
    .from(terminalMembers)
    .innerJoin(terminals, eq(terminalMembers.terminalId, terminals.id))
    .innerJoin(profiles, eq(terminals.ownerId, profiles.id))
    .where(eq(terminalMembers.userId, user.id))
    .orderBy(desc(terminals.createdAt));

  return NextResponse.json({
    owned: owned.map((t) => ({ ...t, role: "owner" })),
    shared: shared.map((t) => ({ ...t, role: "member" })),
  });
}

// POST /api/terminals  { name }  — create a terminal.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json().catch(() => ({}));
  const label = typeof name === "string" && name.trim() ? name.trim() : "Terminal";
  const [row] = await db
    .insert(terminals)
    .values({ ownerId: user.id, name: label })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

// PATCH /api/terminals  { id, status }  — update (e.g. close) my terminal.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, status } = await req.json().catch(() => ({}));
  if (!id || (status !== "active" && status !== "closed")) {
    return NextResponse.json({ error: "Invalid id/status" }, { status: 400 });
  }
  const [row] = await db
    .update(terminals)
    .set({ status, lastActiveAt: new Date() })
    .where(and(eq(terminals.id, id), eq(terminals.ownerId, user.id)))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
