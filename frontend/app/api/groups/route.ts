import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { conversation, conversationMembers, groups, profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isMember } from "@/lib/conversations";

const BUCKET = "attachments";
const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/groups  { name, memberIds[] }  — create a group conversation.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, memberIds } = await req.json().catch(() => ({}));
  const groupName = typeof name === "string" ? name.trim() : "";
  if (!groupName) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const others: string[] = Array.isArray(memberIds)
    ? [...new Set(memberIds.filter((m) => typeof m === "string" && m !== user.id))]
    : [];

  const conversationId = await db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversation)
      .values({ type: "group", createdBy: user.id })
      .returning({ id: conversation.id });
    await tx.insert(groups).values({ conversationId: conv.id, name: groupName, createdBy: user.id });
    await tx.insert(conversationMembers).values([
      { conversationId: conv.id, userId: user.id, role: "admin" },
      ...others.map((id) => ({ conversationId: conv.id, userId: id, role: "member" })),
    ]);
    return conv.id;
  });

  return NextResponse.json({ id: conversationId }, { status: 201 });
}

// GET /api/groups?conversationId=…  — group info (members + your role).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";
  if (!conversationId || !(await isMember(conversationId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [group] = await db
    .select({ name: groups.name, description: groups.description, avatarPath: groups.avatarPath, createdBy: groups.createdBy })
    .from(groups)
    .where(eq(groups.conversationId, conversationId))
    .limit(1);
  if (!group) return NextResponse.json({ error: "Not a group" }, { status: 404 });

  const members = await db
    .select({ id: profiles.id, displayName: profiles.displayName, role: conversationMembers.role })
    .from(conversationMembers)
    .innerJoin(profiles, eq(profiles.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, conversationId));

  let avatarUrl: string | null = null;
  if (group.avatarPath) {
    const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrl(group.avatarPath, 300);
    avatarUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({
    conversationId,
    name: group.name,
    description: group.description ?? "",
    avatarUrl,
    isAdmin: await isAdmin(conversationId, user.id),
    members,
  });
}

// PATCH /api/groups  (multipart or json)  — rename / description / avatar (admin only).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  let conversationId: string, name: string | undefined, description: string | undefined;
  let avatarFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
    conversationId = (form.get("conversationId") as string) ?? "";
    name = (form.get("name") as string | null) ?? undefined;
    description = (form.get("description") as string | null) ?? undefined;
    const f = form.get("file");
    if (f instanceof File && f.size > 0) avatarFile = f;
  } else {
    const body = await req.json().catch(() => ({}));
    conversationId = body.conversationId ?? "";
    name = body.name;
    description = body.description;
  }

  if (!conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  if (!(await isAdmin(conversationId, user.id))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  if (typeof description === "string") updates.description = description.trim() || null;

  if (avatarFile) {
    if (avatarFile.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
    const safeName = avatarFile.name.replace(/[^\w.\-]+/g, "_");
    const path = `group-avatars/${conversationId}/${crypto.randomUUID()}-${safeName}`;
    const admin = createAdminClient();
    const buffer = Buffer.from(await avatarFile.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: avatarFile.type });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updates.avatarPath = path;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(groups).set(updates).where(eq(groups.conversationId, conversationId));
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/groups  { conversationId }  — delete group + conversation (admin only).
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId } = await req.json().catch(() => ({}));
  if (!conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  if (!(await isAdmin(conversationId, user.id))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  // Cascade: groups + conversationMembers + messages are foreign-keyed to conversation.
  await db.delete(conversation).where(eq(conversation.id, conversationId));

  return NextResponse.json({ ok: true });
}
