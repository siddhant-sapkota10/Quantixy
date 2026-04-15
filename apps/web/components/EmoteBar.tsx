"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Emote } from "@/lib/emotes";

type EmoteBarProps = {
  emotes: Emote[];
  open: boolean;
  onToggle: () => void;
  onSend: (emoteId: string) => void;
  coolingDown: boolean;
  cooldownUntil: number;
  disabled: boolean;
};

/**
 * Compact emote picker with:
 * - Single emoji toggle button (💬)
 * - Pop-up grid of large emoji tap targets
 * - Keyboard shortcuts 1–6
 * - Cooldown ring animation on the toggle button
 */
export function EmoteBar({
  emotes,
  open,
  onToggle,
  onSend,
  coolingDown,
  cooldownUntil,
  disabled,
}: EmoteBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onToggle();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onToggle]);

  // Keyboard shortcuts: press 1–6 to fire the corresponding emote
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      const index = Number(e.key) - 1;
      if (index >= 0 && index < emotes.length) {
        onSend(emotes[index].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, emotes, onSend]);

  const durationMs = Math.max(0, cooldownUntil - Date.now());

  return (
    <div ref={containerRef} className="relative">
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || coolingDown}
        aria-label={coolingDown ? "Emote cooldown" : "Send emote (keys 1–6)"}
        title={coolingDown ? "Emote cooldown…" : "Send emote  (keys 1–6)"}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-xl transition-all duration-200 select-none ${
          coolingDown
            ? "border-slate-700 bg-slate-900/60 opacity-50 cursor-not-allowed"
            : open
            ? "border-amber-400/60 bg-amber-950/60 shadow-[0_0_12px_rgba(251,191,36,0.18)]"
            : "border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800 active:scale-90"
        }`}
      >
        💬
        {/* Fade-out ring that visually signals cooldown duration */}
        {coolingDown && durationMs > 0 && (
          <motion.span
            key={cooldownUntil}
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-amber-400/70"
            initial={{ opacity: 0.9, scale: 1 }}
            animate={{ opacity: 0, scale: 1.35 }}
            transition={{ duration: durationMs / 1000, ease: "linear" }}
          />
        )}
      </button>

      {/* Emote picker grid — slides up from the toggle button */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-2 flex gap-1.5 rounded-2xl border border-slate-700/80 bg-slate-900/97 p-2 shadow-2xl backdrop-blur-sm"
            style={{ zIndex: 50 }}
          >
            {emotes.map((emote, index) => (
              <EmoteButton
                key={emote.id}
                emote={emote}
                index={index}
                onSend={onSend}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type EmoteButtonProps = {
  emote: Emote;
  index: number;
  onSend: (id: string) => void;
};

function EmoteButton({ emote, index, onSend }: EmoteButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSend(emote.id)}
      title={`${emote.label} (${index + 1})`}
      aria-label={emote.label}
      className="group relative flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/80 text-2xl transition-all hover:border-amber-400/40 hover:bg-slate-800 active:scale-90 active:border-amber-400/70"
    >
      <span className="pointer-events-none">{emote.icon}</span>
      {/* Keyboard shortcut badge — shown on hover */}
      <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[9px] font-bold text-slate-300 opacity-0 transition group-hover:opacity-100">
        {index + 1}
      </span>
      {/* Label tooltip — shown on hover */}
      <span className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300 opacity-0 transition group-hover:opacity-100">
        {emote.label}
      </span>
    </button>
  );
}
