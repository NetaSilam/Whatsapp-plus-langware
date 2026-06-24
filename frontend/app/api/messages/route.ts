import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { attachments, conversationMembers, messages } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isMember } from "@/lib/conversations";

// Kept as a static route (conversation id passed as a parameter) rather than a
// dynamic /api/conversations/[id]/messages handler: the template's next.config
// rewrite proxies /api/* to FastAPI, and that rewrite shadows DYNAMIC API route
// handlers (they fall through to the proxy) while static ones take precedence.

// Fetch attachments for a set of message ids, grouped by message.
async function attachmentsByMessage(messageIds: string[]) {
  const map = new Map<string, unknown[]>();
  if (messageIds.length === 0) return map;
  const rows = await db
    .select({
      id: attachments.id,
      messageId: attachments.messageId,
      kind: attachments.kind,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
    })
    .from(attachments)
    .where(inArray(attachments.messageId, messageIds));
  for (const a of rows) {
    if (!a.messageId) continue;
    const list = map.get(a.messageId) ?? [];
    list.push(a);
    map.set(a.messageId, list);
  }
  return map;
}

// GET /api/messages?conversationId=…[&after=ISO] — messages (with attachments)
// in order. With `after`, only messages newer than that timestamp.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!(await isMember(conversationId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const after = req.nextUrl.searchParams.get("after");
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        after ? gt(messages.createdAt, new Date(after)) : undefined,
      ),
    )
    .orderBy(asc(messages.createdAt));

  const attMap = await attachmentsByMessage(rows.map((r) => r.id));
  const withAtt = rows.map((r) => ({
    ...r,
    attachments: attMap.get(r.id) ?? [],
  }));

  return NextResponse.json(withAtt);
}

// POST /api/messages  { conversationId, body?, attachmentIds? }  — send a
// message; must have text and/or at least one attachment.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId, body, attachmentIds } = await req
    .json()
    .catch(() => ({}));
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!(await isMember(conversationId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const text = typeof body === "string" ? body.trim() : "";
  const ids: string[] = Array.isArray(attachmentIds)
    ? attachmentIds.filter((x) => typeof x === "string")
    : [];
  if (!text && ids.length === 0) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const [msg] = await db
    .insert(messages)
    .values({ conversationId, senderId: user.id, body: text || null })
    .returning({
      id: messages.id,
      senderId: messages.senderId,
      body: messages.body,
      createdAt: messages.createdAt,
    });

  // Link the uploader's own, not-yet-linked attachments to this message.
  if (ids.length > 0) {
    await db
      .update(attachments)
      .set({ messageId: msg.id })
      .where(
        and(
          inArray(attachments.id, ids),
          eq(attachments.uploaderId, user.id),
          isNull(attachments.messageId),
        ),
      );
  }

  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, user.id),
      ),
    );

  const attMap = await attachmentsByMessage([msg.id]);
  return NextResponse.json(
    { ...msg, attachments: attMap.get(msg.id) ?? [] },
    { status: 201 },
  );
}
