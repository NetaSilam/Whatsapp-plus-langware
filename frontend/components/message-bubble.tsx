"use client";

import { FileText } from "lucide-react";

import { Checks } from "@/components/checks";
import { humanSize, messageTime } from "@/lib/format";
import type { Attachment, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

function AttachmentView({ a }: { a: Attachment }) {
  if (a.mime_type.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <a href={a.url} target="_blank" rel="noreferrer">
        <img
          src={a.url}
          alt={a.file_name ?? "image"}
          className="max-h-64 max-w-full rounded-md object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-md bg-black/5 p-2 hover:bg-black/10 dark:bg-white/10"
    >
      <FileText className="h-8 w-8 shrink-0 opacity-70" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{a.file_name ?? "File"}</p>
        <p className="text-xs text-muted-foreground">{humanSize(a.size_bytes)}</p>
      </div>
    </a>
  );
}

export function MessageBubble({
  message,
  mine,
  senderName,
  showSender,
}: {
  message: Message;
  mine: boolean;
  senderName?: string;
  showSender?: boolean;
}) {
  if (message.kind === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-center text-xs text-muted-foreground">
          {message.body}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 shadow-sm",
          mine
            ? "rounded-br-sm bg-emerald-500 text-white"
            : "rounded-bl-sm bg-card text-card-foreground",
        )}
      >
        {showSender && !mine && (
          <p className="mb-0.5 text-xs font-semibold text-emerald-600">{senderName}</p>
        )}
        {message.attachments.length > 0 && (
          <div className="mb-1 space-y-1">
            {message.attachments.map((a) => (
              <AttachmentView key={a.id} a={a} />
            ))}
          </div>
        )}
        {message.body && <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>}
        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            mine ? "text-white/80" : "text-muted-foreground",
          )}
        >
          <span>{messageTime(message.created_at)}</span>
          {mine && <Checks status={message.status} pending={message.pending} />}
        </div>
      </div>
    </div>
  );
}
