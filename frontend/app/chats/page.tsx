export default function ChatsIndexPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm space-y-2">
        <h2 className="text-xl font-medium">Pick a conversation</h2>
        <p className="text-sm text-muted-foreground">
          Choose one on the left, or hit “+ New chat” to start a new one.
        </p>
      </div>
    </div>
  );
}
