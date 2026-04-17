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
 * - Horizontal bar of 4 emotes (fast PvP)
 * - Collapse toggle button (💬)
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
    <div ref={containerRef} className="relative flex h-10 items-center gap-2 sm:h-11">
      {/* Toggle button (collapse/expand) */}
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={open ? "Hide emotes" : "Show emotes"}
        title={open ? "Hide emotes" : "Show emotes"}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-[18px] transition-all duration-150 ease-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:h-11 sm:w-11 sm:text-xl ${
          disabled
            ? "cursor-not-allowed border-slate-800 bg-slate-950/40 opacity-50"
            : open
              ? "border-amber-400/60 bg-amber-950/60 shadow-[0_0_12px_rgba(251,191,36,0.18)]"
              : "border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800 active:scale-[0.96]"
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

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="bar"
            initial={{ opacity: 0, x: -8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="flex max-w-[calc(100vw-6.5rem)] items-center gap-1.5 overflow-x-auto rounded-full border border-slate-700/80 bg-slate-900/90 px-2 py-1.5 shadow-xl backdrop-blur-sm sm:max-w-none"
          >
            {emotes.slice(0, 6).map((emote, index) => (
              <EmoteButton key={emote.id} emote={emote} index={index} onSend={onSend} disabled={disabled || coolingDown} />
            ))}
            <span className="ml-1 hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 sm:inline">
              1–6
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type EmoteButtonProps = {
  emote: Emote;
  index: number;
  onSend: (id: string) => void;
  disabled?: boolean;
};

function EmoteButton({ emote, index, onSend, disabled }: EmoteButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSend(emote.id)}
      disabled={disabled}
      title={`${emote.label} (${index + 1})`}
      aria-label={emote.label}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-full border text-[18px] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:h-10 sm:w-10 sm:text-xl ${
        disabled
          ? "cursor-not-allowed border-slate-800 bg-slate-950/40 opacity-55 saturate-50"
          : "border-slate-700 bg-slate-950/80 hover:border-amber-400/40 hover:bg-slate-800 active:scale-[0.96] active:border-amber-400/70"
      }`}
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
