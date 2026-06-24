"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Demonstrates the FastAPI auth path: it grabs the Supabase access token and
// calls the protected GET /api/auth/me, which verifies the JWT server-side.
export function MeCheck() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch("/api/auth/me", {
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const body = await res.text();
    setResult(`${res.status} ${body}`);
    setLoading(false);
  }

  return (
    <div className="grid gap-2">
      <Button variant="secondary" onClick={check} disabled={loading}>
        {loading ? "Checking…" : "Call /api/auth/me"}
      </Button>
      {result && (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {result}
        </pre>
      )}
    </div>
  );
}
