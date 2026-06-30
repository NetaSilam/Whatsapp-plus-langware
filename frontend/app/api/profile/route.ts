import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "attachments";
const MAX_BYTES = 5 * 1024 * 1024;

// GET /api/profile — own profile.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db
    .select({ displayName: profiles.displayName, bio: profiles.bio, avatarPath: profiles.avatarPath })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let avatarUrl: string | null = null;
  if (profile.avatarPath) {
    const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrl(profile.avatarPath, 300);
    avatarUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({ ...profile, avatarUrl, email: user.email });
}

// PATCH /api/profile  (multipart: bio?, file?)  — update bio and/or avatar.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const bio = (form.get("bio") as string | null) ?? undefined;
  const file = form.get("file");

  const updates: Record<string, unknown> = {};
  if (typeof bio === "string") updates.bio = bio.trim() || null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `avatars/${user.id}/${crypto.randomUUID()}-${safeName}`;
    const admin = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: file.type });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updates.avatarPath = path;
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  await db.update(profiles).set(updates).where(eq(profiles.id, user.id));
  return NextResponse.json({ ok: true });
}
