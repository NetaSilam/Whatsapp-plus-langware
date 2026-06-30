import { and, ilike, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/users?q=  — search people to start a chat with (excludes self).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const rows = await db
    .select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles)
    .where(
      and(
        ne(profiles.id, user.id),
        q ? ilike(profiles.displayName, `%${q}%`) : undefined,
      ),
    )
    .limit(20);

  if (rows.length === 0) return NextResponse.json([]);

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map(data?.users.map((u) => [u.id, u.email ?? ""]));

  const result = rows.map((r) => ({
    ...r,
    email: emailMap.get(r.id) ?? "",
  }));

  return NextResponse.json(result);
}
