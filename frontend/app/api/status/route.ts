import { and, desc, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { profiles, statuses } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "attachments";
const MAX_BYTES = 25 * 1024 * 1024;

// GET /api/status — all non-expired statuses, newest first.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: statuses.id,
      userId: statuses.userId,
      displayName: profiles.displayName,
      type: statuses.type,
      body: statuses.body,
      mediaPath: statuses.mediaPath,
      createdAt: statuses.createdAt,
      expiresAt: statuses.expiresAt,
    })
    .from(statuses)
    .innerJoin(profiles, eq(profiles.id, statuses.userId))
    .where(gt(statuses.expiresAt, new Date()))
    .orderBy(desc(statuses.createdAt));

  const admin = createAdminClient();
  const result = await Promise.all(
    rows.map(async (r) => {
      let mediaUrl: string | null = null;
      if (r.type === "image" && r.mediaPath) {
        const { data } = await admin.storage.from(BUCKET).createSignedUrl(r.mediaPath, 60);
        mediaUrl = data?.signedUrl ?? null;
      }
      const { mediaPath: _omit, ...rest } = r;
      return { ...rest, mediaUrl };
    }),
  );

  return NextResponse.json(result);
}

// POST /api/status  (multipart: body?, file?) — post a status.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const file = form.get("file");
  const body = (form.get("body") as string | null)?.trim() || null;

  let type: "text" | "image" = "text";
  let mediaPath: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });
    type = "image";
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    mediaPath = `status/${user.id}/${crypto.randomUUID()}-${safeName}`;
    const admin = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(mediaPath, buffer, {
      contentType: file.type || "application/octet-stream",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (!body) {
    return NextResponse.json({ error: "Empty status" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(statuses)
    .values({ userId: user.id, type, body, mediaPath, expiresAt })
    .returning({ id: statuses.id });

  return NextResponse.json(row, { status: 201 });
}

// PATCH /api/status  { id, body }  — edit text body (own status only).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, body } = await req.json().catch(() => ({}));
  const newBody = typeof body === "string" ? body.trim() : "";
  if (!id || !newBody) return NextResponse.json({ error: "id and body required" }, { status: 400 });

  const [row] = await db
    .update(statuses)
    .set({ body: newBody })
    .where(and(eq(statuses.id, id), eq(statuses.userId, user.id)))
    .returning({ id: statuses.id });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/status  { id }  — delete own status (+ storage cleanup).
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [row] = await db
    .delete(statuses)
    .where(and(eq(statuses.id, id), eq(statuses.userId, user.id)))
    .returning({ mediaPath: statuses.mediaPath });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.mediaPath) {
    await createAdminClient().storage.from(BUCKET).remove([row.mediaPath]);
  }

  return NextResponse.json({ ok: true });
}
