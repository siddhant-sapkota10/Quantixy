"use client";

import { AnimatePresence, motion } from "framer-motion";
import { getPowerUpMeta, type PowerUpId } from "@/lib/powerups";

type PowerUpType = PowerUpId | null;

type PowerUpSlotProps = {
  type: PowerUpType;
  /** True once the powerup has been consumed this match. */
  used?: boolean;
  disabled?: boolean;
  onUse?: () => void;
  pulseKey?: number;
  align?: "left" | "right";
};

export function PowerUpSlot({
  type,
  used = false,
  disabled = false,
  onUse,
  pulseKey = 0,
  align = "left"
}: PowerUpSlotProps) {
  const content = getPowerUpMeta(type);
  const justifyClass =
    align === "right"
      ? "items-center sm:items-end"
      : "items-center sm:items-start";

  // Derive display key for AnimatePresence transitions
  const displayKey = type ? `ready-${type}` : used ? "used" : "empty";

  return (
    <div className={`flex flex-col ${justifyClass} gap-2`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        Power-Up
      </span>
      <AnimatePresence mode="wait">
        {type && content ? (
          /* ── READY state ── */
          <motion.button
            key={displayKey}
            type="button"
            onClick={onUse}
            disabled={disabled || !onUse}
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{
              scale: pulseKey > 0 ? [1, 1.08, 1] : 1,
              opacity: 1,
              boxShadow:
                pulseKey > 0
                  ? [
                      "0 0 0 rgba(125,211,252,0)",
                      "0 0 24px rgba(125,211,252,0.35)",
                      "0 0 0 rgba(125,211,252,0)"
                    ]
                  : "0 0 0 rgba(125,211,252,0)"
            }}
            exit={{ scale: 0.82, opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="w-full rounded-2xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-left text-sky-100 transition hover:border-sky-300/50 disabled:cursor-not-allowed disabled:opacity-80 sm:px-4 sm:py-3"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-xl leading-none sm:text-2xl">{content.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{content.name}</p>
                <p className="text-[11px] uppercase tracking-[0.22em] text-sky-200">
                  {onUse ? "Ready" : "Holding"}
                </p>
              </div>
            </div>
          </motion.button>
        ) : used ? (
          /* ── USED state ── */
          <motion.div
            key="used"
            initial={{ scale: 1.06, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-3 py-2 sm:px-4 sm:py-3"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-xl leading-none opacity-40 sm:text-2xl">✓</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">Used</p>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-600">
                  Consumed
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── EMPTY state ── */
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 sm:px-4 sm:py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-500">Empty</span>
              <span className="text-lg leading-none opacity-40 text-slate-500">+</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
