export default function TerminalsIndexPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm space-y-2">
        <h2 className="text-xl font-medium">Pick a terminal</h2>
        <p className="text-sm text-muted-foreground">
          Choose one on the left, or hit “+ New terminal” to spin up a fresh
          PowerShell shared with the people you pick.
        </p>
      </div>
    </div>
  );
}
