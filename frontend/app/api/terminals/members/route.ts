import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { terminals, terminalMembers, profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/terminals/members?terminalId= — list invited members (owner only).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const terminalId = req.nextUrl.searchParams.get("terminalId");
  if (!terminalId) return NextResponse.json({ error: "terminalId required" }, { status: 400 });

  const [terminal] = await db
    .select({ id: terminals.id })
    .from(terminals)
    .where(and(eq(terminals.id, terminalId), eq(terminals.ownerId, user.id)))
    .limit(1);
  if (!terminal) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({ userId: terminalMembers.userId, displayName: profiles.displayName })
    .from(terminalMembers)
    .innerJoin(profiles, eq(terminalMembers.userId, profiles.id))
    .where(eq(terminalMembers.terminalId, terminalId));

  if (rows.length === 0) return NextResponse.json([]);

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map(data?.users.map((u) => [u.id, u.email ?? ""]));

  return NextResponse.json(
    rows.map((r) => ({ ...r, email: emailMap.get(r.userId) ?? "" })),
  );
}
