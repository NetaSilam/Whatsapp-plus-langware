"use client";

import { Check, CheckCheck, Clock } from "lucide-react";

import type { ReceiptStatus } from "@/lib/types";

export function Checks({ status, pending }: { status: ReceiptStatus; pending?: boolean }) {
  if (pending) return <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "delivered")
    return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  return null;
}
