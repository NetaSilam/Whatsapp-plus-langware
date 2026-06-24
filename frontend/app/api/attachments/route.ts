import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { attachments, messages } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isMember } from "@/lib/conversations";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "attachments";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// POST /api/attachments  (multipart: file)  — upload, returns metadata. The
// attachment is unlinked until referenced by /api/messages.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const kind = file.type.startsWith("image/") ? "image" : "file";
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;

  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [row] = await db
    .insert(attachments)
    .values({
      uploaderId: user.id,
      kind,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storagePath: path,
    })
    .returning({
      id: attachments.id,
      kind: attachments.kind,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
    });

  return NextResponse.json(row, { status: 201 });
}

// GET /api/attachments?id=…  — redirect to a short-lived signed URL after an
// authorization check (member of the message's conversation, or the uploader
// for a not-yet-sent file).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const [att] = await db
    .select({
      storagePath: attachments.storagePath,
      uploaderId: attachments.uploaderId,
      messageId: attachments.messageId,
      conversationId: messages.conversationId,
    })
    .from(attachments)
    .leftJoin(messages, eq(messages.id, attachments.messageId))
    .where(eq(attachments.id, id))
    .limit(1);
  if (!att) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = att.conversationId
    ? await isMember(att.conversationId, user.id)
    : att.uploaderId === user.id;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(att.storagePath, 60);
  if (error || !data) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
