"use client";

import "@xterm/xterm/css/xterm.css";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const WS_BASE = process.env.NEXT_PUBLIC_API_WS_URL ?? "ws://localhost:8080";

export function TerminalPanel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Connecting…");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let term: import("@xterm/xterm").Terminal | null = null;
    let fit: import("@xterm/addon-fit").FitAddon | null = null;
    let disposed = false;
    let onResizeWindow: (() => void) | null = null;

    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      if (disposed || !containerRef.current) return;

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        theme: { background: "#0b1021", foreground: "#e6e6e6" },
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();

      let ticket: string;
      try {
        const res = await api.post<{ ticket: string }>("/api/terminal/ticket", {
          conversation_id: conversationId,
        });
        ticket = res.ticket;
      } catch {
        setStatus("Failed to authorize terminal");
        return;
      }

      ws = new WebSocket(
        `${WS_BASE}/ws/terminal/${conversationId}?ticket=${encodeURIComponent(ticket)}`,
      );

      ws.onopen = () => setStatus("Connected");
      ws.onclose = () => setStatus("Disconnected");
      ws.onerror = () => setStatus("Connection error");

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case "ready":
            setStatus("Live — shared session");
            fit?.fit();
            if (ws?.readyState === WebSocket.OPEN && term)
              ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
            term?.focus();
            break;
          case "output":
            term?.write(b64ToBytes(msg.data));
            break;
          case "joined":
            term?.writeln(`\x1b[38;5;245m— ${msg.username} joined the terminal —\x1b[0m`);
            break;
          case "left":
            term?.writeln(`\x1b[38;5;245m— ${msg.username} left the terminal —\x1b[0m`);
            break;
          case "closed":
            term?.writeln(`\x1b[38;5;203m\r\n${msg.reason}\x1b[0m`);
            setStatus("Session ended");
            break;
          case "error":
            term?.writeln(`\x1b[38;5;203m${msg.message}\x1b[0m`);
            setStatus(msg.message);
            break;
        }
      };

      term.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "input", data }));
      });

      onResizeWindow = () => {
        fit?.fit();
        if (ws?.readyState === WebSocket.OPEN && term)
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };
      window.addEventListener("resize", onResizeWindow);
    })();

    return () => {
      disposed = true;
      if (onResizeWindow) window.removeEventListener("resize", onResizeWindow);
      ws?.close();
      term?.dispose();
    };
  }, [conversationId]);

  return (
    <div className="flex h-72 flex-col border-t bg-[#0b1021]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-white/70">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Shared terminal · {status}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden p-2" />
    </div>
  );
}
