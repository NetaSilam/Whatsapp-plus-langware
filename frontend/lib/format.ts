import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";

export function messageTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

export function listTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd/MM/yyyy");
}

export function lastSeen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "last seen just now";
  if (isToday(d)) return `last seen today at ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `last seen yesterday at ${format(d, "HH:mm")}`;
  return `last seen ${formatDistanceToNowStrict(d)} ago`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
