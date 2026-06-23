"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

type ConnectionState = "connecting" | "open" | "closed" | "error";

export function TerminalView({
  terminalId,
  title,
  accessToken,
}: {
  terminalId: string;
  title: string;
  accessToken: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ConnectionState>("connecting");
  const [closeCode, setCloseCode] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        "Consolas, 'Cascadia Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 13,
      theme: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
      },
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        // ignore — container may have been removed
      }
    };
    window.addEventListener("resize", onResize);

    const wsBase =
      process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8080";
    const wsUrl =
      `${wsBase}/api/ws/terminal/${terminalId}` +
      `?token=${encodeURIComponent(accessToken)}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setState("open");
    };
    ws.onmessage = (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        term.write(data);
      } else {
        // Binary fallback (unused — backend currently sends text).
        const text = new TextDecoder().decode(new Uint8Array(data));
        term.write(text);
      }
    };
    ws.onerror = () => {
      setState("error");
    };
    ws.onclose = (ev) => {
      setCloseCode(ev.code);
      setState("closed");
    };

    const inputDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    return () => {
      window.removeEventListener("resize", onResize);
      inputDisposable.dispose();
      try {
        ws.close();
      } catch {
        // ignore
      }
      term.dispose();
    };
  }, [terminalId, accessToken]);

  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-xs text-muted-foreground">
            Live shared PowerShell on the host. Anyone in the room can run
            commands.
          </p>
        </div>
        <span
          className={
            state === "open"
              ? "text-xs text-emerald-600"
              : state === "connecting"
                ? "text-xs text-muted-foreground"
                : "text-xs text-red-500"
          }
        >
          {state === "open"
            ? "Connected"
            : state === "connecting"
              ? "Connecting…"
              : state === "error"
                ? "Connection error"
                : closeCode === 4401
                  ? "Not authenticated"
                  : closeCode === 4403
                    ? "Not a member of this terminal"
                    : closeCode
                      ? `Closed (${closeCode})`
                      : "Closed"}
        </span>
      </header>
      <div
        ref={containerRef}
        className="flex-1 bg-[#0a0a0a] p-2"
        style={{ minHeight: 0 }}
      />
    </>
  );
}
