"use client";

import "@xterm/xterm/css/xterm.css";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

// Mounts an xterm.js terminal and bridges it to the FastAPI PTY WebSocket.
export function TerminalView({ terminalId }: { terminalId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;

    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        theme: { background: "#0b0b0b" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();

      const {
        data: { session },
      } = await createClient().auth.getSession();
      const token = session?.access_token ?? "";
      const base =
        process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8080";
      const ws = new WebSocket(
        `${base}/ws/terminal/${terminalId}?token=${encodeURIComponent(token)}`,
      );

      const sendResize = () => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
          );
        }
      };

      ws.onopen = () => sendResize();
      ws.onmessage = (e) => term.write(e.data as string);
      ws.onclose = () => term.writeln("\r\n\x1b[31m*** disconnected ***\x1b[0m");
      ws.onerror = () =>
        term.writeln("\r\n\x1b[31m*** connection error ***\x1b[0m");

      const dataSub = term.onData((d) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data: d }));
        }
      });
      window.addEventListener("resize", sendResize);

      cleanup = () => {
        window.removeEventListener("resize", sendResize);
        dataSub.dispose();
        ws.close();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [terminalId]);

  return (
    <div
      ref={containerRef}
      className="h-[70vh] w-full overflow-hidden rounded-md border bg-[#0b0b0b] p-2"
    />
  );
}
