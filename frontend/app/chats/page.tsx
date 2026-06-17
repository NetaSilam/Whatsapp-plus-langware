export default function ChatsIndex() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500 text-4xl">
        💬
      </div>
      <h2 className="text-xl font-semibold">Chatter</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Select a conversation or start a new one. Real-time messaging, groups,
        attachments, and a live shared terminal.
      </p>
    </div>
  );
}
