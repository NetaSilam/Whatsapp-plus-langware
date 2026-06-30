"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { EmojiClickData } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface Props {
  onEmoji: (emoji: string) => void;
  /** Where the picker opens relative to the button. Default: "top" */
  direction?: "top" | "bottom";
}

export function EmojiPickerButton({ onEmoji, direction = "top" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-base hover:bg-accent"
        title="Add emoji"
      >
        😊
      </button>

      {open && (
        <div
          className={`absolute z-50 ${direction === "top" ? "bottom-11" : "top-11"} right-0`}
        >
          <EmojiPicker
            onEmojiClick={(data: EmojiClickData) => {
              onEmoji(data.emoji);
              setOpen(false);
            }}
            lazyLoadEmojis
            height={380}
            width={300}
          />
        </div>
      )}
    </div>
  );
}
